import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepsTurno } from "@/lib/agente/loop";
import {
  MAX_SUGESTOES,
  rodarAgendador,
  sugerirFollowups,
  textoFollowup,
  type PropostaParada,
} from "@/lib/agente/pendencias";
import type { Cliente, FollowupGerado, Mensagem, Orcamento, Servico } from "@/lib/dominio/tipos";
import { abrirBancoTeste, carregarSql, criarMei, type BancoTeste } from "../helpers/banco";
import { llmFalso, type LlmFalso } from "../helpers/llm-falso";

// A rota do cron é testada de verdade, com dublês só nas bordas: `db.rpc`
// responde com o SQL no PGlite e o modelo é o LLM falso.
const h = vi.hoisted(() => ({
  banco: null as unknown as import("../helpers/banco").BancoTeste,
  llm: null as unknown as import("../helpers/llm-falso").LlmFalso,
}));

vi.mock("@/lib/supabase", () => ({
  db: {
    async rpc(nome: string, args: Record<string, unknown>) {
      try {
        return { data: await h.banco.rpc(nome, args), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  async requireUser() {
    throw new Error("REDIRECT:/login");
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    cronSecret: "segredo-do-cron",
    featherlessApiKey: "chave-falsa",
    agenteModelo: "modelo-falso",
    limiteDiarioTokens: 400_000,
  },
}));

vi.mock("@/lib/agente/llm", () => ({ criarLlm: () => h.llm }));

const rota = await import("@/app/api/cron/pendencias/route");

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
  h.llm = llmLembrete();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

/**
 * Modelo falso que faz o que o pedido do agendador manda: lê os ids do texto
 * do usuário, chama `redigir_mensagem` e depois fecha com uma frase.
 */
function llmLembrete(): LlmFalso {
  const llm: LlmFalso = llmFalso((volta) => {
    const ultima = llm.pedidos[volta - 1].mensagens.at(-1)!;
    if (ultima.role !== "user") return { texto: "Lembrete pronto para você revisar." };
    const texto = ultima.content as string;
    const id = (k: string) => new RegExp(`${k} ([0-9a-f-]{36})`).exec(texto)![1];
    return {
      chamadas: [
        {
          nome: "redigir_mensagem",
          entrada: {
            cliente_id: id("cliente_id"),
            servico_id: id("servico_id"),
            tarefa_id: id("tarefa_id"),
            objetivo: "lembrete",
            conteudo: "Oi! Conseguiu ver o orçamento que mandei?",
          },
        },
      ],
    };
  });
  return llm;
}

function deps(mei: string, llm: LlmFalso = h.llm): DepsTurno {
  return { rpc: b.rpc, llm, meiId: mei, hoje: "2026-11-13", system: "system", limiteDiario: 400_000 };
}

const aprovar = (mei: string, tipo: string, id: string) =>
  b.rpc("item_decidir", { p_mei: mei, p_tipo: tipo, p_id: id, p_decisao: "aprovar", p_user: null });

/**
 * Serviço de R$ 800 com orçamento enviado pelas funções de verdade (serviço
 * em `aguardando_resposta`), com o envio recuado em `dias`.
 */
async function propostaEnviada(dias: number, mei?: string, descricao = "Instalação de ar-condicionado") {
  mei ??= await criarMei(b, "Refrigeração Bueno");
  const c = (await b.rpc("cliente_salvar", {
    p_mei: mei,
    p_dados: { nome: "Carlos Lima", whatsapp: "62 9 9999-0000" },
  })) as Cliente;
  const s = (await b.rpc("servico_registrar", {
    p_mei: mei,
    p_dados: { cliente_id: c.id, descricao, valor: 800 },
  })) as Servico;
  const o = (await b.rpc("orcamento_gerar", { p_mei: mei, p_servico: s.id })) as Orcamento;
  await aprovar(mei, "orcamento", o.id);
  const m = (await b.rpc("mensagem_rascunhar", {
    p_mei: mei,
    p_dados: { canal: "whatsapp", objetivo: "envio_orcamento", servico_id: s.id, conteudo: "Segue o orçamento." },
  })) as Mensagem;
  await aprovar(mei, "mensagem", m.id);
  await b.rpc("mensagem_marcar_enviada", { p_mei: mei, p_id: m.id });
  await b.q(`update public.orcamentos set enviado_em = now() - make_interval(days => $2) where servico_id = $1`, [
    s.id,
    dias,
  ]);
  return { mei, c, s };
}

const gerar = (mei?: string) =>
  b.rpc("tarefas_gerar_followups", { p_dias: 3, p_mei: mei }) as Promise<FollowupGerado[]>;

const lembretes = (mei: string) =>
  b.q(`select * from public.mensagens where mei_id = $1 and objetivo = 'lembrete' order by criado_em`, [mei]);

describe("SQL da proatividade", () => {
  it("o SQL continua idempotente", async () => {
    await carregarSql(b.pg);
  });

  it("tarefas_gerar_followups com p_mei só abre tarefa daquele MEI", async () => {
    const a = await propostaEnviada(4);
    const outro = await propostaEnviada(4, await criarMei(b, "Outro MEI"));
    const novas = await gerar(a.mei);
    expect(novas.map((n) => n.servico_id)).toEqual([a.s.id]);
    // Sem p_mei, o resto (o cron).
    expect((await gerar()).map((n) => n.servico_id)).toEqual([outro.s.id]);
  });

  it("followups_sem_lembrete, followups_meis_pendentes e propostas_paradas", async () => {
    const { mei, s } = await propostaEnviada(4);
    // Antes do agendador: aparece no Início sem tarefa, e não há o que redigir.
    let paradas = (await b.rpc("propostas_paradas", { p_mei: mei })) as PropostaParada[];
    expect(paradas).toHaveLength(1);
    expect(paradas[0]).toMatchObject({ servico_id: s.id, tarefa_id: null, mensagem_id: null, dias_parado: 4 });
    expect(await b.rpc("followups_meis_pendentes")).toEqual([]);

    const [t] = await gerar();
    expect(await b.rpc("followups_meis_pendentes")).toEqual([mei]);
    expect(await b.rpc("followups_sem_lembrete", { p_mei: mei })).toMatchObject([
      { tarefa_id: t.tarefa_id, servico_id: s.id, cliente_nome: "Carlos Lima", valor: 800, dias_parado: 4 },
    ]);

    // Com lembrete: sai das duas filas e o Início mostra o lembrete.
    const m = (await b.rpc("mensagem_rascunhar", {
      p_mei: mei,
      p_dados: { canal: "whatsapp", objetivo: "lembrete", servico_id: s.id, tarefa_id: t.tarefa_id, conteudo: "Oi!" },
    })) as Mensagem;
    expect(await b.rpc("followups_meis_pendentes")).toEqual([]);
    expect(await b.rpc("followups_sem_lembrete", { p_mei: mei })).toEqual([]);
    paradas = (await b.rpc("propostas_paradas", { p_mei: mei })) as PropostaParada[];
    expect(paradas[0]).toMatchObject({ tarefa_id: t.tarefa_id, mensagem_id: m.id, mensagem_status: "rascunho" });

    // Ignorada: some do Início (até o agendador abrir tarefa de novo).
    await b.rpc("tarefa_fechar", { p_mei: mei, p_id: t.tarefa_id, p_status: "ignorada" });
    expect(await b.rpc("propostas_paradas", { p_mei: mei })).toEqual([]);
  });

  it("propostas_paradas e followups_sem_lembrete não mostram nada de outro MEI", async () => {
    await propostaEnviada(4);
    await gerar();
    const outro = await criarMei(b, "Outro MEI");
    expect(await b.rpc("propostas_paradas", { p_mei: outro })).toEqual([]);
    expect(await b.rpc("followups_sem_lembrete", { p_mei: outro })).toEqual([]);
  });

  it("mei_por_id devolve o MEI", async () => {
    const mei = await criarMei(b, "Refrigeração Bueno");
    expect(await b.rpc("mei_por_id", { p_mei: mei })).toMatchObject({ id: mei, nome: "Refrigeração Bueno" });
  });
});

describe("textoFollowup", () => {
  it("leva número, cliente, descrição, valor, dias e os ids que a ferramenta precisa", () => {
    const t = textoFollowup({
      tarefa_id: "11111111-1111-1111-1111-111111111111",
      servico_id: "22222222-2222-2222-2222-222222222222",
      cliente_id: "33333333-3333-3333-3333-333333333333",
      numero: 9,
      descricao: "Troca de fiação",
      valor: 450,
      cliente_nome: "Carlos",
      dias_parado: 4,
    });
    expect(t).toBe(
      "Proposta parada: serviço #009 (Carlos, Troca de fiação, R$ 450,00) sem resposta há 4 dias. " +
        "Redija um lembrete curto e cordial com redigir_mensagem (objetivo lembrete, " +
        "cliente_id 33333333-3333-3333-3333-333333333333, servico_id 22222222-2222-2222-2222-222222222222, " +
        "tarefa_id 11111111-1111-1111-1111-111111111111).",
    );
  });
});

describe("sugerirFollowups", () => {
  it("proposta parada há 4 dias → 1 lembrete em rascunho com a tarefa; rodar de novo não duplica", async () => {
    const { mei, s } = await propostaEnviada(4);
    const [t] = await gerar();

    expect(await sugerirFollowups(deps(mei), mei)).toEqual({ sugeridas: 1, tentativas: 1 });
    let ms = await lembretes(mei);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ status: "rascunho", tarefa_id: t.tarefa_id, servico_id: s.id, canal: "whatsapp" });

    const voltas = h.llm.pedidos.length;
    expect(await sugerirFollowups(deps(mei), mei)).toEqual({ sugeridas: 0, tentativas: 0 });
    ms = await lembretes(mei);
    expect(ms).toHaveLength(1);
    expect(h.llm.pedidos).toHaveLength(voltas);
  });

  it("o turno é do agendador, com o contexto do negócio e o pedido do lembrete", async () => {
    const { mei } = await propostaEnviada(4);
    await b.rpc("memoria_salvar", { p_mei: mei, p_fato: "Assina como Bueno" });
    await gerar();
    await sugerirFollowups(deps(mei), mei);

    const pedido = h.llm.pedidos[0].mensagens.at(-1)!.content as string;
    expect(pedido.startsWith("<contexto_do_negocio>")).toBe(true);
    expect(pedido).toContain("Hoje: 2026-11-13");
    expect(pedido).toContain("Assina como Bueno");
    expect(pedido).toContain("Proposta parada: serviço #001 (Carlos Lima, Instalação de ar-condicionado, R$ 800,00)");

    const [c] = await b.q(`select origem, titulo from public.conversas where mei_id = $1`, [mei]);
    expect(c.origem).toBe("agendador");
    expect(c.titulo.startsWith("Proposta parada: serviço #001")).toBe(true);
  });

  it(`7 propostas paradas → ${MAX_SUGESTOES} sugeridas; a próxima execução faz o resto`, async () => {
    const mei = await criarMei(b, "Refrigeração Bueno");
    for (let i = 1; i <= 7; i++) await propostaEnviada(4, mei, `Serviço ${i}`);
    expect(await gerar()).toHaveLength(7);

    expect(await sugerirFollowups(deps(mei), mei)).toEqual({ sugeridas: 5, tentativas: 5 });
    expect(await lembretes(mei)).toHaveLength(5);
    expect(await sugerirFollowups(deps(mei), mei)).toEqual({ sugeridas: 2, tentativas: 2 });
    expect(await lembretes(mei)).toHaveLength(7);
  });

  it("modelo fora do ar: nada é sugerido, nada lança, e a tarefa fica para a próxima", async () => {
    const { mei } = await propostaEnviada(4);
    await gerar();
    const quebrado = llmFalso([{ lancar: new Error("O modelo está sem capacidade agora.") }]);
    expect(await sugerirFollowups(deps(mei, quebrado), mei)).toEqual({ sugeridas: 0, tentativas: 1 });
    expect(await lembretes(mei)).toHaveLength(0);
    expect(await sugerirFollowups(deps(mei), mei)).toEqual({ sugeridas: 1, tentativas: 1 });
  });

  it("modelo que não liga a tarefa não conta como sugerida", async () => {
    const { mei } = await propostaEnviada(4);
    await gerar();
    const distraido = llmFalso([{ texto: "Claro, vou pensar num lembrete." }]);
    expect(await sugerirFollowups(deps(mei, distraido), mei)).toEqual({ sugeridas: 0, tentativas: 1 });
  });

  it("limite 0 não chama o modelo", async () => {
    const { mei } = await propostaEnviada(4);
    await gerar();
    expect(await sugerirFollowups(deps(mei), mei, 0)).toEqual({ sugeridas: 0, tentativas: 0 });
    expect(h.llm.pedidos).toHaveLength(0);
  });
});

describe("rodarAgendador", () => {
  it("abre as tarefas e redige os lembretes de todos os MEIs, com teto global", async () => {
    const a = await criarMei(b, "MEI A");
    const outro = await criarMei(b, "MEI B");
    for (let i = 1; i <= 4; i++) await propostaEnviada(4, a, `A${i}`);
    for (let i = 1; i <= 3; i++) await propostaEnviada(4, outro, `B${i}`);

    const r = await rodarAgendador(b.rpc, (mei) => deps(mei));
    expect(r).toEqual({ tarefasNovas: 7, sugeridas: 5, meis: 2 });

    // A próxima execução não abre tarefa nova e termina o que faltou.
    expect(await rodarAgendador(b.rpc, (mei) => deps(mei))).toEqual({ tarefasNovas: 0, sugeridas: 2, meis: 1 });
    expect((await lembretes(a)).length + (await lembretes(outro)).length).toBe(7);
  });

  it("com meiId, só mexe naquele MEI", async () => {
    const a = await propostaEnviada(4);
    const outro = await propostaEnviada(4, await criarMei(b, "Outro MEI"));
    expect(await rodarAgendador(b.rpc, (mei) => deps(mei), { meiId: a.mei })).toEqual({
      tarefasNovas: 1,
      sugeridas: 1,
      meis: 1,
    });
    expect(await b.q(`select 1 from public.tarefas where mei_id = $1`, [outro.mei])).toHaveLength(0);
    expect(await lembretes(outro.mei)).toHaveLength(0);
  });
});

describe("rota /api/cron/pendencias", () => {
  const chamar = (metodo: "GET" | "POST", cabecalhos: Record<string, string> = {}) =>
    rota[metodo](new Request("http://localhost/api/cron/pendencias", { method: metodo, headers: cabecalhos }));

  it.each([
    ["sem segredo", {}],
    ["segredo errado", { Authorization: "Bearer outro" }],
    ["segredo sem Bearer", { Authorization: "segredo-do-cron" }],
  ])("%s responde 401 e não faz nada", async (_n, cab) => {
    await propostaEnviada(4);
    for (const m of ["GET", "POST"] as const) expect((await chamar(m, cab)).status).toBe(401);
    expect(await b.q(`select 1 from public.tarefas`)).toHaveLength(0);
  });

  it("com o segredo, roda o agendador e diz o que fez", async () => {
    const { mei } = await propostaEnviada(4);
    const res = await chamar("POST", { Authorization: "Bearer segredo-do-cron" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(await res.json()).toEqual({ ok: true, tarefasNovas: 1, sugeridas: 1, meis: 1 });
    expect(await lembretes(mei)).toHaveLength(1);

    // GET também (o pg_cron e a Vercel chamam de jeitos diferentes); nada novo.
    const de_novo = await chamar("GET", { Authorization: "Bearer segredo-do-cron" });
    expect(await de_novo.json()).toEqual({ ok: true, tarefasNovas: 0, sugeridas: 0, meis: 0 });
  });
});
