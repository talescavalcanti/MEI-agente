import type { ModelMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  anexarMensagens,
  criarConversa,
  historico,
  lerConversa,
  listarConversas,
  registrarAcao,
  tituloDe,
} from "@/lib/agente/conversas";
import { executarFerramenta } from "@/lib/agente/ferramentas/executar";
import { MAX_VOLTAS, rodarTurno } from "@/lib/agente/loop";
import type { Evento, Llm } from "@/lib/agente/tipos";
import { limiteAtingido, somarUso, usoHoje } from "@/lib/agente/uso";
import type { Cliente, Servico } from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";
import { llmFalso } from "../helpers/llm-falso";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

describe("conversas.ts", () => {
  it("cria, anexa e devolve o histórico como veio", async () => {
    const mei = await criarMei(b);
    const c = await criarConversa(b.rpc, mei, { origem: "chat", titulo: "oi" });
    expect(c).toMatchObject({ mei_id: mei, titulo: "oi", origem: "chat" });

    const msgs: ModelMessage[] = [
      { role: "user", content: "oi" },
      { role: "assistant", content: [{ type: "text", text: "Olá!" }] },
    ];
    await anexarMensagens(b.rpc, mei, c.id, [
      { mensagem: msgs[0] },
      { mensagem: msgs[1], cartoes: [{ tipo: "mensagem", id: "abc" }] },
    ]);

    const linhas = await lerConversa(b.rpc, mei, c.id);
    expect(linhas.map((l) => l.role)).toEqual(["user", "assistant"]);
    expect(linhas[1].cartoes).toEqual([{ tipo: "mensagem", id: "abc" }]);
    expect(historico(linhas)).toEqual(msgs);
    expect((await listarConversas(b.rpc, mei)).map((x) => x.id)).toEqual([c.id]);
  });

  it("anexar lista vazia não chama o banco", async () => {
    let chamadas = 0;
    await anexarMensagens(async () => void chamadas++, "m", "c", []);
    expect(chamadas).toBe(0);
  });

  it("registrarAcao grava a auditoria", async () => {
    const mei = await criarMei(b);
    const c = await criarConversa(b.rpc, mei, { titulo: "x" });
    await registrarAcao(b.rpc, mei, {
      conversaId: c.id,
      tipo: "ferramenta",
      nome: "buscar_cliente",
      entrada: { termo: "a" },
      saida: { conteudo: "[]" },
      erro: false,
    });
    const [a] = await b.q(`select tipo, nome, entrada, erro from public.agente_acoes`);
    expect(a).toEqual({ tipo: "ferramenta", nome: "buscar_cliente", entrada: { termo: "a" }, erro: false });
  });

  it("tituloDe usa a primeira linha, sem espaços extras, com no máximo 60 caracteres", () => {
    expect(tituloDe("  Troca de   fiação\nno Carlos ")).toBe("Troca de fiação");
    expect(tituloDe("a".repeat(100))).toBe(`${"a".repeat(59)}…`);
    expect(tituloDe("   ")).toBe("Nova conversa");
    expect(tituloDe("<contexto_do_negocio>\nHoje: 2026-11-13\n</contexto_do_negocio>\n\nOrçamento do Carlos")).toBe(
      "Orçamento do Carlos",
    );
  });
});

describe("uso.ts", () => {
  it("soma o uso do dia e diz quando o limite foi atingido", async () => {
    const mei = await criarMei(b);
    expect(await usoHoje(b.rpc, mei)).toBe(0);
    expect(await limiteAtingido(b.rpc, mei, 100)).toBe(false);
    await somarUso(b.rpc, mei, { entrada: 80, saida: 20 });
    expect(await usoHoje(b.rpc, mei)).toBe(100);
    expect(await limiteAtingido(b.rpc, mei, 100)).toBe(true);
    expect(await limiteAtingido(b.rpc, mei, 101)).toBe(false);
  });

  it("uso zerado não chama o banco", async () => {
    let chamadas = 0;
    await somarUso(async () => void chamadas++, "m", { entrada: 0, saida: 0 });
    expect(chamadas).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Laço do agente
// ---------------------------------------------------------------------------

const HOJE = "2026-11-13";

type Linha = { id: number; role: string; content: ModelMessage; cartoes: unknown };

async function rodar(llm: Llm, mei: string, texto: string, opcoes: { conversaId?: string | null; limite?: number } = {}) {
  const eventos: Evento[] = [];
  const r = await rodarTurno(
    { rpc: b.rpc, llm, meiId: mei, hoje: HOJE, system: "Você é um assistente.", limiteDiario: opcoes.limite ?? 1_000_000 },
    { conversaId: opcoes.conversaId ?? null, texto },
    (e) => eventos.push(e),
  );
  return { ...r, eventos };
}

const linhas = (mei: string, conversa: string) =>
  b.rpc("conversa_ler", { p_mei: mei, p_conversa: conversa }) as Promise<Linha[]>;
const contar = async (tabela: string) => Number((await b.q(`select count(*)::int as n from public.${tabela}`))[0].n);

type Parte = { type: string; toolCallId?: string };
const partes = (m: ModelMessage): Parte[] => (Array.isArray(m.content) ? (m.content as Parte[]) : []);
const idsDe = (m: ModelMessage, tipo: string) =>
  partes(m)
    .filter((p) => p.type === tipo)
    .map((p) => p.toolCallId!)
    .sort();

/** Toda chamada de ferramenta tem resultado logo em seguida, e todo resultado tem chamada. */
function pareado(ls: Linha[]): boolean {
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].content;
    const chamadas = m.role === "assistant" ? idsDe(m, "tool-call") : [];
    if (m.role === "tool") {
      const anterior = ls[i - 1]?.content;
      if (!anterior || anterior.role !== "assistant") return false;
      if (JSON.stringify(idsDe(anterior, "tool-call")) !== JSON.stringify(idsDe(m, "tool-result"))) return false;
    }
    if (chamadas.length) {
      const prox = ls[i + 1]?.content;
      if (!prox || prox.role !== "tool") return false;
    }
  }
  return true;
}

async function clienteDe(mei: string) {
  return (await b.rpc("cliente_salvar", {
    p_mei: mei,
    p_dados: { nome: "Carlos Lima", whatsapp: "62 9 8888-0000" },
  })) as Cliente;
}

const tipos = (eventos: Evento[]) => eventos.map((e) => e.tipo).filter((t) => t !== "texto");

describe("rodarTurno", () => {
  it("texto simples: grava usuário e assistente, emite o texto e fim", async () => {
    const mei = await criarMei(b);
    const llm = llmFalso([{ texto: "Olá! Em que posso ajudar?" }]);
    const { conversaId, eventos } = await rodar(llm, mei, "oi");

    const ls = await linhas(mei, conversaId);
    expect(ls.map((l) => l.role)).toEqual(["user", "assistant"]);
    expect(ls[0].content).toEqual({ role: "user", content: "oi" });
    expect(eventos.filter((e) => e.tipo === "texto").map((e) => (e as { delta: string }).delta).join("")).toBe(
      "Olá! Em que posso ajudar?",
    );
    expect(eventos.at(-1)).toEqual({ tipo: "fim", conversaId });
    expect(tipos(eventos)).toEqual(["fim"]);
    expect(await usoHoje(b.rpc, mei)).toBe(15);
    expect(llm.pedidos[0].system).toBe("Você é um assistente.");
    expect(llm.pedidos[0].ferramentas.length).toBeGreaterThan(0);

    const [c] = await b.q(`select titulo, origem from public.conversas where id = $1`, [conversaId]);
    expect(c).toEqual({ titulo: "oi", origem: "chat" });
  });

  it("registrar_servico: 4 linhas, 1 ação auditada, uso das duas voltas", async () => {
    const mei = await criarMei(b);
    const cli = await clienteDe(mei);
    const llm = llmFalso([
      {
        chamadas: [
          { nome: "registrar_servico", entrada: { cliente_id: cli.id, descricao: "Troca de fiação", valor: 800, fechado: true } },
        ],
        uso: { entrada: 100, saida: 20 },
      },
      { texto: "Registrei o serviço.", uso: { entrada: 200, saida: 30 } },
    ]);
    const { conversaId, eventos } = await rodar(llm, mei, "Fechei troca de fiação com o Carlos por 800");

    const ls = await linhas(mei, conversaId);
    expect(ls.map((l) => l.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(pareado(ls)).toBe(true);
    expect(await contar("servicos")).toBe(1);

    const acoes = await b.q(`select conversa_id, tipo, nome, erro, entrada from public.agente_acoes`);
    expect(acoes).toEqual([
      {
        conversa_id: conversaId,
        tipo: "ferramenta",
        nome: "registrar_servico",
        erro: false,
        entrada: { cliente_id: cli.id, descricao: "Troca de fiação", valor: 800, fechado: true },
      },
    ]);
    expect(await usoHoje(b.rpc, mei)).toBe(350);
    expect(tipos(eventos)).toEqual(["ferramenta", "fim"]);
    expect(eventos.find((e) => e.tipo === "ferramenta")).toEqual({ tipo: "ferramenta", nome: "registrar_servico", erro: false });
  });

  it("duas chamadas na mesma volta: uma mensagem de resultados com as duas", async () => {
    const mei = await criarMei(b);
    const llm = llmFalso([
      {
        chamadas: [
          { nome: "buscar_cliente", entrada: { termo: "Carlos" } },
          { nome: "salvar_memoria", entrada: { fato: "Cobra 50% de sinal." } },
        ],
      },
      { texto: "Pronto." },
    ]);
    const { conversaId } = await rodar(llm, mei, "anota que cobro 50% de sinal e vê se o Carlos tá cadastrado");

    const ls = await linhas(mei, conversaId);
    expect(ls.map((l) => l.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(idsDe(ls[2].content, "tool-result")).toEqual(["chamada-1-1", "chamada-1-2"]);
    expect(pareado(ls)).toBe(true);
    expect(await contar("agente_acoes")).toBe(2);
    expect(await b.rpc("memoria_listar", { p_mei: mei })).toMatchObject([{ fato: "Cobra 50% de sinal." }]);
  });

  it("as mensagens da volta 1 chegam à volta 2 e ao turno seguinte idênticas, com partes desconhecidas", async () => {
    const mei = await criarMei(b);
    const estranha = { type: "parte-do-provedor", assinatura: "abc", dados: { lista: [1, { x: null }], ok: true } };
    const llm = llmFalso([
      {
        texto: "Vou procurar.",
        chamadas: [{ nome: "buscar_cliente", entrada: { termo: "Ana" } }],
        extras: [estranha],
        campos: { providerOptions: { featherless: { cache: "x" } } },
      },
      { texto: "Não achei a Ana." },
      { texto: "Certo." },
    ]);
    const { conversaId } = await rodar(llm, mei, "procura a Ana");
    await rodar(llm, mei, "ok", { conversaId });

    const volta1 = llm.devolvidas[0][0];
    expect(llm.pedidos[1].mensagens[1]).toEqual(volta1);
    // Turno seguinte: o histórico volta do banco igual ao que o modelo devolveu.
    expect(llm.pedidos[2].mensagens.slice(0, 4)).toEqual(llm.pedidos[1].mensagens.concat(llm.devolvidas[1]));
    expect(llm.pedidos[2].mensagens[1]).toEqual(volta1);
    expect(llm.pedidos[2].mensagens.at(-1)).toEqual({ role: "user", content: "ok" });
  });

  it("cartão: emitido e gravado na mensagem do assistente que pediu a ferramenta", async () => {
    const mei = await criarMei(b);
    const cli = await clienteDe(mei);
    const serv = (await b.rpc("servico_registrar", {
      p_mei: mei,
      p_dados: { cliente_id: cli.id, descricao: "Troca de fiação", valor: 800, fechado: false },
    })) as Servico;
    const llm = llmFalso([
      { chamadas: [{ nome: "gerar_orcamento", entrada: { servico_id: serv.id } }] },
      { texto: "Orçamento pronto, confira no cartão." },
    ]);
    const { conversaId, eventos } = await rodar(llm, mei, "gera o orçamento");

    const [orc] = await b.q(`select id from public.orcamentos`);
    const cartao = { tipo: "orcamento", id: orc.id };
    expect(eventos).toContainEqual({ tipo: "cartao", cartao });
    expect(tipos(eventos)).toEqual(["ferramenta", "cartao", "fim"]);

    const ls = await linhas(mei, conversaId);
    expect(ls.map((l) => l.cartoes)).toEqual([null, [cartao], null, null]);
    const [acao] = await b.q(`select saida from public.agente_acoes`);
    expect(acao.saida.cartao).toEqual(cartao);
  });

  it("ferramenta com erro: resultado com erro vai ao modelo e o turno continua", async () => {
    const mei = await criarMei(b);
    const llm = llmFalso([
      { chamadas: [{ nome: "gerar_orcamento", entrada: { servico_id: "00000000-0000-4000-8000-000000000000" } }] },
      { texto: "Não encontrei esse serviço." },
    ]);
    const { conversaId, eventos } = await rodar(llm, mei, "gera o orçamento");

    expect(eventos).toContainEqual({ tipo: "ferramenta", nome: "gerar_orcamento", erro: true });
    expect(eventos.at(-1)).toEqual({ tipo: "fim", conversaId });
    const ls = await linhas(mei, conversaId);
    const [res] = partes(ls[2].content) as unknown as { output: { type: string; value: string } }[];
    expect(res.output.type).toBe("error-text");
    expect(res.output.value).toContain("não encontrado");
    expect((await b.q(`select erro from public.agente_acoes`))[0].erro).toBe(true);
    expect(await contar("orcamentos")).toBe(0);
  });

  describe("Review Focus 4: falha no meio do turno", () => {
    it("filtro com chamadas: nada executado, erro, histórico pareado", async () => {
      const mei = await criarMei(b);
      const cli = await clienteDe(mei);
      const llm = llmFalso([
        { chamadas: [{ nome: "buscar_cliente", entrada: { termo: "Carlos" } }] },
        {
          motivo: "filtro",
          chamadas: [{ nome: "registrar_servico", entrada: { cliente_id: cli.id, descricao: "x", fechado: true } }],
        },
      ]);
      const { conversaId, eventos } = await rodar(llm, mei, "registra");

      expect(await contar("servicos")).toBe(0);
      expect(await contar("agente_acoes")).toBe(1); // só o buscar_cliente da volta 1
      expect(tipos(eventos)).toEqual(["ferramenta", "erro", "fim"]);
      const ls = await linhas(mei, conversaId);
      expect(ls.map((l) => l.role)).toEqual(["user", "assistant", "tool"]);
      expect(pareado(ls)).toBe(true);
      expect(await usoHoje(b.rpc, mei)).toBe(30); // as duas voltas gastaram

      // A conversa segue utilizável.
      const llm2 = llmFalso([{ texto: "Certo." }]);
      const r2 = await rodar(llm2, mei, "tenta de novo", { conversaId });
      expect(tipos(r2.eventos)).toEqual(["fim"]);
      expect(pareado(await linhas(mei, conversaId))).toBe(true);
    });

    it.each(["limite", "outro"] as const)("motivo %s: não grava a volta e emite erro", async (motivo) => {
      const mei = await criarMei(b);
      const llm = llmFalso([{ texto: "Texto cortado no mei", motivo }]);
      const { conversaId, eventos } = await rodar(llm, mei, "oi");
      expect(tipos(eventos)).toEqual(["erro", "fim"]);
      expect((await linhas(mei, conversaId)).map((l) => l.role)).toEqual(["user"]);
    });

    it(`modelo que pede ferramenta para sempre: para em ${MAX_VOLTAS} voltas, histórico pareado`, async () => {
      expect(MAX_VOLTAS).toBe(8);
      const mei = await criarMei(b);
      const llm = llmFalso(() => ({ chamadas: [{ nome: "buscar_cliente", entrada: { termo: "Carlos" } }] }));
      const { conversaId, eventos } = await rodar(llm, mei, "procura");

      expect(llm.pedidos).toHaveLength(MAX_VOLTAS);
      expect(await contar("agente_acoes")).toBe(MAX_VOLTAS - 1);
      expect(eventos.filter((e) => e.tipo === "erro")).toHaveLength(1);
      expect(eventos.at(-1)).toEqual({ tipo: "fim", conversaId });
      const ls = await linhas(mei, conversaId);
      expect(ls).toHaveLength(1 + 2 * (MAX_VOLTAS - 1));
      expect(pareado(ls)).toBe(true);
    });

    it("llm.turno que lança: erro, mensagem do usuário preservada, próxima chamada funciona", async () => {
      const mei = await criarMei(b);
      const llm = llmFalso([{ lancar: new Error("O modelo está sobrecarregado. Tente de novo em instantes.") }]);
      const { conversaId, eventos } = await rodar(llm, mei, "oi");

      expect(eventos).toEqual([
        { tipo: "erro", mensagem: "O modelo está sobrecarregado. Tente de novo em instantes." },
        { tipo: "fim", conversaId },
      ]);
      expect(await linhas(mei, conversaId)).toMatchObject([{ role: "user", content: { role: "user", content: "oi" } }]);

      const llm2 = llmFalso([{ texto: "Oi! Agora foi." }]);
      const r2 = await rodar(llm2, mei, "oi de novo", { conversaId });
      expect(r2.conversaId).toBe(conversaId);
      expect(tipos(r2.eventos)).toEqual(["fim"]);
      expect(llm2.pedidos[0].mensagens).toEqual([
        { role: "user", content: "oi" },
        { role: "user", content: "oi de novo" },
      ]);
      expect((await linhas(mei, conversaId)).map((l) => l.role)).toEqual(["user", "user", "assistant"]);
    });

    it("motivo fim com chamadas: as chamadas são executadas (nunca fica chamada sem resultado)", async () => {
      const mei = await criarMei(b);
      const llm = llmFalso([
        { motivo: "fim", chamadas: [{ nome: "buscar_cliente", entrada: { termo: "Carlos" } }] },
        { texto: "Não achei." },
      ]);
      const { conversaId } = await rodar(llm, mei, "procura");
      const ls = await linhas(mei, conversaId);
      expect(ls.map((l) => l.role)).toEqual(["user", "assistant", "tool", "assistant"]);
      expect(pareado(ls)).toBe(true);
    });
  });

  describe("limite diário", () => {
    it("uso no limite: llm.turno não é chamado e nada é gravado", async () => {
      const mei = await criarMei(b);
      await somarUso(b.rpc, mei, { entrada: 900, saida: 100 });
      const llm = llmFalso([{ texto: "não devia" }]);
      const { eventos } = await rodar(llm, mei, "oi", { limite: 1000 });

      expect(llm.pedidos).toHaveLength(0);
      expect(eventos).toEqual([{ tipo: "erro", mensagem: "Você atingiu o limite de uso de hoje." }]);
      expect(await contar("conversas")).toBe(0);
      expect(await contar("conversa_mensagens")).toBe(0);
    });

    it("em conversa existente: erro e fim, sem gravar a mensagem", async () => {
      const mei = await criarMei(b);
      const { conversaId } = await rodar(llmFalso([{ texto: "Oi" }]), mei, "oi");
      await somarUso(b.rpc, mei, { entrada: 5000, saida: 0 });
      const llm = llmFalso([{ texto: "não devia" }]);
      const { eventos } = await rodar(llm, mei, "de novo", { conversaId, limite: 1000 });
      expect(llm.pedidos).toHaveLength(0);
      expect(tipos(eventos)).toEqual(["erro", "fim"]);
      expect(await linhas(mei, conversaId)).toHaveLength(2);
    });
  });

  it("conversa de outro MEI: erro de conversa não encontrada, modelo não é chamado", async () => {
    const a = await criarMei(b, "A");
    const outro = await criarMei(b, "B");
    const { conversaId } = await rodar(llmFalso([{ texto: "Oi" }]), a, "oi");
    const llm = llmFalso([{ texto: "não devia" }]);
    const { eventos } = await rodar(llm, outro, "oi", { conversaId });
    expect(llm.pedidos).toHaveLength(0);
    expect(eventos).toEqual([{ tipo: "erro", mensagem: "conversa não encontrada" }]);
    expect(await linhas(a, conversaId)).toHaveLength(2);
  });

  it("origem agendador e título sem o bloco de contexto", async () => {
    const mei = await criarMei(b);
    const eventos: Evento[] = [];
    const { conversaId } = await rodarTurno(
      { rpc: b.rpc, llm: llmFalso([{ texto: "Ok" }]), meiId: mei, hoje: HOJE, system: "s", limiteDiario: 1e9 },
      {
        conversaId: null,
        texto: "<contexto_do_negocio>\nHoje: 2026-11-13\n</contexto_do_negocio>\n\nProposta parada: serviço #9",
        origem: "agendador",
      },
      (e) => eventos.push(e),
    );
    const [c] = await b.q(`select titulo, origem from public.conversas where id = $1`, [conversaId]);
    expect(c).toEqual({ titulo: "Proposta parada: serviço #9", origem: "agendador" });
  });

  it("emitir que lança não interrompe o turno", async () => {
    const mei = await criarMei(b);
    const { conversaId } = await rodarTurno(
      { rpc: b.rpc, llm: llmFalso([{ texto: "Ok" }]), meiId: mei, hoje: HOJE, system: "s", limiteDiario: 1e9 },
      { conversaId: null, texto: "oi" },
      () => {
        throw new Error("cliente desconectou");
      },
    );
    expect((await linhas(mei, conversaId)).map((l) => l.role)).toEqual(["user", "assistant"]);
  });
});

describe("salvar_memoria de verdade (executarFerramenta + 06-agente.sql)", () => {
  it("grava a memória e o mesmo fato não duplica", async () => {
    const mei = await criarMei(b);
    const ctx = { rpc: b.rpc, meiId: mei, hoje: HOJE };
    const r = await executarFerramenta(ctx, "salvar_memoria", { fato: "Atende só em Goiânia." });
    expect(r.erro).toBe(false);
    await executarFerramenta(ctx, "salvar_memoria", { fato: "atende só em goiânia." });
    expect(await b.rpc("memoria_listar", { p_mei: mei })).toMatchObject([{ fato: "Atende só em Goiânia." }]);
  });

  it("fato longo demais vira erro legível", async () => {
    const mei = await criarMei(b);
    const r = await executarFerramenta({ rpc: b.rpc, meiId: mei, hoje: HOJE }, "salvar_memoria", { fato: "x".repeat(600) });
    expect(r.erro).toBe(true);
    expect(r.conteudo).toMatch(/500 caracteres|entrada_invalida/);
  });
});
