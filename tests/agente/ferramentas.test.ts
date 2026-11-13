import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FERRAMENTAS } from "@/lib/agente/ferramentas/definicoes";
import { executarFerramenta, type ResultadoFerramenta } from "@/lib/agente/ferramentas/executar";
import { AVISO_MINUTA } from "@/lib/documentos/contrato";
import type { Rpc } from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;
let mei: string;

// Abrir o PGlite com todo o SQL passa dos 10s padrão do hook quando a suíte
// inteira roda em paralelo; mesmo teto do testTimeout.
beforeEach(async () => {
  b = await abrirBancoTeste();
  mei = await criarMei(b, "Refrigeração do Zé");
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const HOJE = "2026-11-13";

const rodar = (nome: string, entrada: unknown) => executarFerramenta({ rpc: b.rpc, meiId: mei, hoje: HOJE }, nome, entrada);

/** Roda e exige sucesso; devolve o conteúdo já lido do JSON. */
async function ok(nome: string, entrada: unknown) {
  const r = await rodar(nome, entrada);
  expect(r.erro, `${nome}: ${r.conteudo}`).toBe(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { r, dados: JSON.parse(r.conteudo) as any };
}

describe("FERRAMENTAS", () => {
  it("tem a lista e a ordem do plano", () => {
    expect(FERRAMENTAS.map((f) => f.nome)).toEqual([
      "buscar_cliente",
      "criar_ou_atualizar_cliente",
      "registrar_servico",
      "atualizar_servico",
      "listar_dados_faltantes",
      "listar_servicos",
      "mudar_status_servico",
      "gerar_orcamento",
      "gerar_minuta_contrato",
      "redigir_mensagem",
      "salvar_rascunho_post",
      "agendar_servico",
      "consultar_agenda",
      "listar_propostas_pendentes",
      "registrar_pagamento",
      "salvar_memoria",
      "preparar_nota_fiscal",
      "salvar_documento_cliente",
      "consultar_faturamento",
      "consultar_conhecimento",
    ]);
  });

  it("não tem nenhuma ferramenta de envio", () => {
    expect(FERRAMENTAS.filter((f) => f.nome.startsWith("enviar"))).toEqual([]);
  });

  it("descrições curtas (modelo com 32k de contexto)", () => {
    for (const f of FERRAMENTAS) expect(f.descricao.length, f.nome).toBeLessThanOrEqual(200);
  });
});

describe("executarFerramenta", () => {
  it("cenário do README ponta a ponta termina com 3 cartões e serviço confirmado", async () => {
    const cartoes: ResultadoFerramenta["cartao"][] = [];

    const { dados: cliente } = await ok("criar_ou_atualizar_cliente", { nome: "Maria Souza" });
    expect(cliente.id).toBeTruthy();

    const { dados: servico } = await ok("registrar_servico", {
      cliente_id: cliente.id,
      descricao: "Instalação de ar-condicionado split",
      valor: 800,
      data_prevista: "2026-11-20",
      fechado: true,
    });
    expect(servico.status).toBe("confirmado");

    const { dados: faltam } = await ok("listar_dados_faltantes", { servico_id: servico.id });
    expect(faltam).toEqual(["cliente.whatsapp", "cliente.endereco", "servico.forma_pagamento"]);

    await ok("criar_ou_atualizar_cliente", {
      id: cliente.id,
      whatsapp: "62 9 9999-0000",
      endereco: "Rua 1, Setor Bueno, Goiânia",
    });
    await ok("atualizar_servico", { servico_id: servico.id, forma_pagamento: "pix" });
    expect((await ok("listar_dados_faltantes", { servico_id: servico.id })).dados).toEqual([]);

    const orc = await ok("gerar_orcamento", { servico_id: servico.id });
    cartoes.push(orc.r.cartao);
    expect(orc.r.cartao).toEqual({ tipo: "orcamento", id: orc.dados.id });

    const minuta = await ok("gerar_minuta_contrato", { servico_id: servico.id, clausulas_extras: ["Garantia de 90 dias."] });
    cartoes.push(minuta.r.cartao);
    expect(minuta.r.cartao?.tipo).toBe("contrato");
    const [ctr] = await b.q(`select minuta, status from public.contratos where id = $1`, [minuta.r.cartao?.id]);
    expect(ctr.minuta.startsWith(AVISO_MINUTA)).toBe(true);
    expect(ctr.minuta).toContain("Maria Souza");
    expect(ctr.minuta).toContain("R$ 800,00");
    expect(ctr.minuta).toContain("Garantia de 90 dias.");
    expect(ctr.status).toBe("rascunho");

    const msg = await ok("redigir_mensagem", {
      cliente_id: cliente.id,
      servico_id: servico.id,
      objetivo: "envio_orcamento",
      conteudo: "Oi Maria! Segue o orçamento da instalação: R$ 800,00 no Pix.",
    });
    cartoes.push(msg.r.cartao);
    expect(msg.r.cartao?.tipo).toBe("mensagem");
    expect(msg.dados.aviso_valores).toBeUndefined();

    expect(cartoes.map((c) => c?.tipo)).toEqual(["orcamento", "contrato", "mensagem"]);
    const [s] = await b.q(`select status from public.servicos where id = $1`, [servico.id]);
    expect(s.status).toBe("confirmado");
    // Nada foi enviado nem aprovado: tudo é rascunho até o botão do usuário.
    const [m] = await b.q(`select status from public.mensagens where id = $1`, [msg.r.cartao?.id]);
    expect(m.status).toBe("rascunho");
  });

  it("refazer a minuta mantém um contrato só, em rascunho", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "João" });
    const { dados: s } = await ok("registrar_servico", { cliente_id: c.id, descricao: "Limpeza", valor: 200, fechado: true });
    const a = await ok("gerar_minuta_contrato", { servico_id: s.id });
    const d = await ok("gerar_minuta_contrato", { servico_id: s.id });
    expect(d.r.cartao?.id).toBe(a.r.cartao?.id);
    const linhas = await b.q(`select minuta from public.contratos`);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].minuta).toContain("[A PREENCHER]");
  });

  it("redigir_mensagem avisa valor diferente do serviço (Review Focus 5)", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Ana" });
    const { dados: s } = await ok("registrar_servico", { cliente_id: c.id, descricao: "Instalação", valor: 800, fechado: false });
    const { r, dados } = await ok("redigir_mensagem", {
      cliente_id: c.id,
      servico_id: s.id,
      objetivo: "confirmacao",
      conteudo: "Fechado, Ana: R$ 80 pela instalação.",
    });
    expect(dados.aviso_valores).toEqual(["R$ 80,00"]);
    expect(r.cartao?.tipo).toBe("mensagem");
  });

  it("salvar_rascunho_post grava mensagem de instagram com objetivo post", async () => {
    const { r } = await ok("salvar_rascunho_post", { conteudo: "Promoção de limpeza de split em novembro!" });
    expect(r.cartao?.tipo).toBe("mensagem");
    const [m] = await b.q(`select canal, objetivo, cliente_id from public.mensagens where id = $1`, [r.cartao?.id]);
    expect(m).toEqual({ canal: "instagram", objetivo: "post", cliente_id: null });
  });

  it("agendar_servico usa data e hora de São Paulo e consultar_agenda acha", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Bia" });
    const { dados: s } = await ok("registrar_servico", { cliente_id: c.id, descricao: "Manutenção", valor: 150, fechado: true });
    await ok("agendar_servico", { servico_id: s.id, data: "2026-11-20", hora: "14:30", local: "Rua 2" });
    const [a] = await b.q(`select inicio from public.agendamentos where servico_id = $1`, [s.id]);
    expect(new Date(a.inicio).toISOString()).toBe("2026-11-20T17:30:00.000Z");
    const { dados } = await ok("consultar_agenda", { de: "2026-11-20", ate: "2026-11-20" });
    expect(dados).toHaveLength(1);
    expect(dados[0].servico_id).toBe(s.id);

    const r = await rodar("agendar_servico", { servico_id: s.id, data: "2026-02-31", hora: "10:00" });
    expect(r.erro).toBe(true);
  });

  it("pagamento, listagem e mudança de status", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Caio" });
    const { dados: s } = await ok("registrar_servico", { cliente_id: c.id, descricao: "Conserto", valor: 300, fechado: true });
    expect((await ok("registrar_pagamento", { servico_id: s.id, valor: 100, forma: "pix" })).dados.restante).toBe(200);
    expect((await ok("listar_servicos", { status: "confirmado" })).dados).toHaveLength(1);
    expect((await ok("mudar_status_servico", { servico_id: s.id, para: "executado" })).dados.status).toBe("executado");
    expect((await ok("buscar_cliente", { termo: "caio" })).dados[0].id).toBe(c.id);
    expect((await ok("listar_propostas_pendentes", {})).dados).toEqual([]);
  });

  it("id inventado vira erro legível e nada é gravado (Review Focus 3)", async () => {
    const r = await rodar("gerar_orcamento", { servico_id: randomUUID() });
    expect(r.erro).toBe(true);
    expect(r.conteudo).toContain("não encontrado");
    expect(r.cartao).toBeUndefined();
    expect(await b.q(`select 1 from public.orcamentos`)).toHaveLength(0);
  });

  it("id de outro MEI se comporta como inexistente", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Duda" });
    const outro = await criarMei(b, "Outro MEI");
    const r = await executarFerramenta({ rpc: b.rpc, meiId: outro, hoje: HOJE }, "registrar_servico", {
      cliente_id: c.id,
      descricao: "x",
      fechado: false,
    });
    expect(r.erro).toBe(true);
    expect(JSON.parse(r.conteudo)).toEqual({ erro: "cliente não encontrado" });
    expect(await b.q(`select 1 from public.servicos`)).toHaveLength(0);
  });

  it("id que nem é uuid vira entrada_invalida, não erro interno", async () => {
    const r = await rodar("listar_dados_faltantes", { servico_id: "123" });
    expect(r.erro).toBe(true);
    expect(JSON.parse(r.conteudo).entrada_invalida).toBeDefined();
  });

  it("entrada sem campo obrigatório → entrada_invalida", async () => {
    const r = await rodar("registrar_servico", { descricao: "sem cliente", fechado: true });
    expect(r.erro).toBe(true);
    const c = JSON.parse(r.conteudo);
    expect(Array.isArray(c.entrada_invalida)).toBe(true);
    expect(c.entrada_invalida.join(" ")).toContain("cliente_id");
  });

  it("ferramenta desconhecida → erro", async () => {
    const r = await rodar("enviar_mensagem", { conteudo: "oi" });
    expect(r.erro).toBe(true);
    expect(JSON.parse(r.conteudo).erro).toContain("enviar_mensagem");
  });

  it("exceção que não é regra → erro interno genérico e console.error", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc: Rpc = async () => {
      throw new Error("connection reset");
    };
    const r = await executarFerramenta({ rpc, meiId: mei, hoje: HOJE }, "buscar_cliente", { termo: "x" });
    expect(r).toEqual({ conteudo: JSON.stringify({ erro: "erro interno, tente de novo" }), erro: true });
    expect(espiao).toHaveBeenCalled();
    espiao.mockRestore();
  });

  it("salvar_memoria chama memoria_salvar (ponta a ponta fica para a Task 9)", async () => {
    const chamadas: [string, unknown][] = [];
    const rpc: Rpc = async (nome, args) => {
      chamadas.push([nome, args]);
      return { id: "m1", fato: "atende só em Goiânia" };
    };
    const r = await executarFerramenta({ rpc, meiId: mei, hoje: HOJE }, "salvar_memoria", { fato: "atende só em Goiânia" });
    expect(r.erro).toBe(false);
    expect(chamadas).toEqual([["memoria_salvar", { p_mei: mei, p_fato: "atende só em Goiânia" }]]);
  });
});
