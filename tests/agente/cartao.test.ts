import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Cliente, ItemVisto, Mensagem, Orcamento, Servico } from "@/lib/dominio/tipos";
import { AVISO_MINUTA } from "@/lib/documentos/contrato";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

// As actions falam com o Supabase (`db.rpc`) e com a sessão (`requireUser`).
// Aqui os dois viram dublês: o `db.rpc` responde com o SQL de verdade no
// PGlite, no formato `{ data, error }` do supabase-js.
const h = vi.hoisted(() => ({
  banco: null as unknown as BancoTeste,
  user: null as null | { id: string; email: string; name: string; role: "user" },
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
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
}));

vi.mock("next/navigation", () => ({
  redirect(url: string): never {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  erroDeAcao,
  linkWhatsApp,
  montarCartao,
  validarEdicao,
} from "@/app/painel/agente/cartao-dados";
import { decidirItem, editarItem, marcarEnviada, verItem } from "@/app/painel/agente/actions";

// ---------------------------------------------------------------- lógica pura

describe("linkWhatsApp", () => {
  it("monta https://wa.me/55<dígitos>?text=… com o texto codificado", () => {
    expect(linkWhatsApp("62999990000", "Olá, Maria! Valor: R$ 800 & pix")).toBe(
      "https://wa.me/5562999990000?text=Ol%C3%A1%2C%20Maria!%20Valor%3A%20R%24%20800%20%26%20pix",
    );
  });

  it("aceita número com máscara e não duplica o 55", () => {
    expect(linkWhatsApp("(62) 9 9999-0000", "oi")).toBe("https://wa.me/5562999990000?text=oi");
    expect(linkWhatsApp("+55 62 99999-0000", "oi")).toBe("https://wa.me/5562999990000?text=oi");
  });

  it("sem whatsapp ou com número curto demais → null", () => {
    expect(linkWhatsApp(null, "oi")).toBeNull();
    expect(linkWhatsApp("", "oi")).toBeNull();
    expect(linkWhatsApp("99990000", "oi")).toBeNull();
  });
});

describe("erroDeAcao", () => {
  it("regra: vira a frase para a tela", () => {
    expect(erroDeAcao(new Error("regra: este item já foi aprovado"))).toEqual({
      erro: "Este item já foi aprovado.",
    });
  });

  it("outro erro vira mensagem genérica, sem o texto do banco", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = erroDeAcao(new Error('relation "public.x" does not exist'));
    expect(r.erro).not.toContain("relation");
    expect(r.erro).toMatch(/tente de novo/i);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("validarEdicao", () => {
  it("mensagem: conteúdo aparado; vazio ou > 2000 é erro", () => {
    expect(validarEdicao("mensagem", { conteudo: "  oi  " })).toEqual({ ok: true, dados: { conteudo: "oi" } });
    expect(validarEdicao("mensagem", { conteudo: "   " })).toMatchObject({ ok: false });
    expect(validarEdicao("mensagem", { conteudo: "a".repeat(2001) })).toMatchObject({ ok: false });
  });

  it("contrato: só a minuta", () => {
    expect(validarEdicao("contrato", { minuta: "texto", outro: 1 })).toEqual({ ok: true, dados: { minuta: "texto" } });
    expect(validarEdicao("contrato", {})).toMatchObject({ ok: false });
  });

  it("orçamento: valores em reais escritos à brasileira viram número", () => {
    const r = validarEdicao("orcamento", {
      itens: [
        { descricao: " Mão de obra ", valor: "1.200,50" },
        { descricao: "Material", valor: 99.5 },
      ],
      validade_dias: "15",
    });
    expect(r).toEqual({
      ok: true,
      dados: {
        itens: [
          { descricao: "Mão de obra", valor: 1200.5 },
          { descricao: "Material", valor: 99.5 },
        ],
        validade_dias: 15,
      },
    });
  });

  it("orçamento: item sem descrição, valor inválido ou validade fora da faixa é erro", () => {
    expect(validarEdicao("orcamento", { itens: [{ descricao: "", valor: 10 }] })).toMatchObject({ ok: false });
    expect(validarEdicao("orcamento", { itens: [{ descricao: "x", valor: "abc" }] })).toMatchObject({ ok: false });
    expect(validarEdicao("orcamento", { itens: [{ descricao: "x", valor: -1 }] })).toMatchObject({ ok: false });
    expect(validarEdicao("orcamento", { validade_dias: 0 })).toMatchObject({ ok: false });
  });
});

const meiDoc = { nome: "Refrigeração do Zé", atividade: null, cidade: null, telefone: null, chave_pix: null };
const clienteDoc = { nome: "Maria Souza", whatsapp: "62999990000", endereco: null };
const servicoDoc = {
  numero: 7,
  descricao: "Instalação de ar-condicionado",
  valor: 800,
  data_prevista: "2026-11-20",
  local: null,
  forma_pagamento: "pix",
};

function mensagem(campos: Partial<Mensagem> = {}): Mensagem {
  return {
    id: randomUUID(),
    mei_id: randomUUID(),
    cliente_id: randomUUID(),
    servico_id: randomUUID(),
    canal: "whatsapp",
    objetivo: "envio_orcamento",
    conteudo: "Oi Maria, segue o orçamento de R$ 800,00.",
    status: "rascunho",
    aprovado_em: null,
    aprovado_por: null,
    enviado_em: null,
    tarefa_id: null,
    criado_em: "2026-11-13T12:00:00Z",
    atualizado_em: "2026-11-13T12:00:00Z",
    ...campos,
  };
}

const vistoMensagem = (m: Mensagem, cliente: ItemVisto["cliente"] = clienteDoc): ItemVisto => ({
  item: m,
  mei: meiDoc,
  cliente,
  servico: servicoDoc,
  orcamento: null,
});

describe("montarCartao", () => {
  it("rascunho: Aprovar, Editar, Descartar", () => {
    const c = montarCartao("mensagem", vistoMensagem(mensagem()));
    expect(c.botoes).toEqual(["aprovar", "editar", "descartar"]);
    expect(c.status).toBe("rascunho");
  });

  it("mensagem aprovada: Copiar, Abrir no WhatsApp, Marcar como enviada", () => {
    const m = mensagem({ status: "aprovado" });
    const c = montarCartao("mensagem", vistoMensagem(m));
    expect(c.botoes).toEqual(["copiar", "whatsapp", "marcar_enviada"]);
    expect(c.tipo === "mensagem" && c.whatsapp).toBe(
      `https://wa.me/5562999990000?text=${encodeURIComponent(m.conteudo)}`,
    );
  });

  it("mensagem aprovada sem whatsapp do cliente: sem o botão do WhatsApp", () => {
    const m = mensagem({ status: "aprovado" });
    const c = montarCartao("mensagem", vistoMensagem(m, { ...clienteDoc, whatsapp: null }));
    expect(c.botoes).toEqual(["copiar", "marcar_enviada"]);
    expect(c.tipo === "mensagem" && c.whatsapp).toBeNull();
  });

  it("post do Instagram aprovado: sem WhatsApp", () => {
    const m = mensagem({ status: "aprovado", canal: "instagram", objetivo: "post", cliente_id: null, servico_id: null });
    const c = montarCartao("mensagem", { ...vistoMensagem(m, null), servico: null });
    expect(c.botoes).toEqual(["copiar", "marcar_enviada"]);
  });

  it("descartado e enviado: sem botões", () => {
    expect(montarCartao("mensagem", vistoMensagem(mensagem({ status: "descartado" }))).botoes).toEqual([]);
    expect(montarCartao("mensagem", vistoMensagem(mensagem({ status: "enviado" }))).botoes).toEqual([]);
  });

  it("mensagem com valor diferente do serviço traz os valores divergentes", () => {
    const m = mensagem({ conteudo: "Fica R$ 80,00 de sinal e 750 reais no fim." });
    const c = montarCartao("mensagem", vistoMensagem(m));
    expect(c.tipo === "mensagem" && c.divergentes).toEqual(["R$ 80,00", "R$ 750,00"]);
    expect(c.tipo === "mensagem" && c.valorServico).toBe("R$ 800,00");
  });

  it("mensagem com o valor certo ou sem serviço: sem divergência", () => {
    const certo = montarCartao("mensagem", vistoMensagem(mensagem()));
    expect(certo.tipo === "mensagem" && certo.divergentes).toEqual([]);
    const semServico = montarCartao("mensagem", { ...vistoMensagem(mensagem({ conteudo: "R$ 5" })), servico: null });
    expect(semServico.tipo === "mensagem" && semServico.divergentes).toEqual([]);
  });

  it("contrato: aviso jurídico, link Ver documento e minuta sem o aviso repetido", () => {
    const id = randomUUID();
    const c = montarCartao("contrato", {
      item: {
        id,
        mei_id: randomUUID(),
        servico_id: randomUUID(),
        minuta: `${AVISO_MINUTA}\n\nCONTRATO DE PRESTAÇÃO DE SERVIÇO`,
        status: "rascunho",
        aprovado_em: null,
        aprovado_por: null,
        criado_em: "",
        atualizado_em: "",
      },
      mei: meiDoc,
      cliente: clienteDoc,
      servico: servicoDoc,
      orcamento: null,
    });
    expect(c.tipo).toBe("contrato");
    if (c.tipo !== "contrato") return;
    expect(c.aviso).toBe(AVISO_MINUTA);
    expect(c.documento).toBe(`/painel/documentos/contrato/${id}`);
    expect(c.texto).toBe("CONTRATO DE PRESTAÇÃO DE SERVIÇO");
    expect(c.edicao).toEqual({ minuta: `${AVISO_MINUTA}\n\nCONTRATO DE PRESTAÇÃO DE SERVIÇO` });
  });

  it("orçamento: renderizado do banco, com os dados crus para editar", () => {
    const itens = [
      { descricao: "Mão de obra", valor: 600 },
      { descricao: "Material", valor: 200 },
    ];
    const c = montarCartao("orcamento", {
      item: {
        id: randomUUID(),
        mei_id: randomUUID(),
        servico_id: randomUUID(),
        numero: 7,
        valor: 800,
        itens,
        validade_dias: 15,
        status: "rascunho",
        aprovado_em: null,
        aprovado_por: null,
        enviado_em: null,
        respondido_em: null,
        criado_em: "",
        atualizado_em: "",
      },
      mei: meiDoc,
      cliente: clienteDoc,
      servico: servicoDoc,
      orcamento: { numero: 7, valor: 800, itens, validade_dias: 15 },
    });
    expect(c.tipo).toBe("orcamento");
    if (c.tipo !== "orcamento") return;
    expect(c.titulo).toContain("Orçamento nº 7");
    expect(c.orcamento.total).toBe("R$ 800,00");
    expect(c.orcamento.linhas).toHaveLength(2);
    expect(c.edicao).toEqual({ itens, validade_dias: 15 });
  });
});

// ---------------------------------------------------------------- actions

describe("actions (PGlite)", () => {
  let b: BancoTeste;

  beforeAll(async () => {
    b = await abrirBancoTeste();
    h.banco = b;
  }, 30_000);
  afterAll(() => b.fechar());

  /** Usuário logado com MEI, cliente e serviço de R$ 800, e uma mensagem e um orçamento em rascunho. */
  async function cenario() {
    const mei = await criarMei(b, `Refrigeração ${randomUUID().slice(0, 6)}`);
    const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [mei]);
    h.user = { id: user_id, email: "ze@teste.local", name: "Zé", role: "user" };
    const c = (await b.rpc("cliente_salvar", {
      p_mei: mei,
      p_dados: { nome: "Maria Souza", whatsapp: "62 9 9999-0000" },
    })) as Cliente;
    const s = (await b.rpc("servico_registrar", {
      p_mei: mei,
      p_dados: { cliente_id: c.id, descricao: "Instalação de ar", valor: 800, forma_pagamento: "pix", fechado: false },
    })) as Servico;
    const m = (await b.rpc("mensagem_rascunhar", {
      p_mei: mei,
      p_dados: { canal: "whatsapp", objetivo: "confirmacao", conteudo: "Oi Maria, confirmado por R$ 800.", servico_id: s.id },
    })) as Mensagem;
    const o = (await b.rpc("orcamento_gerar", { p_mei: mei, p_servico: s.id })) as Orcamento;
    return { mei, user_id, c, s, m, o };
  }

  beforeEach(() => {
    h.user = null;
  });

  it("verItem devolve o cartão montado", async () => {
    const { m } = await cenario();
    const r = await verItem("mensagem", m.id);
    expect(r).toMatchObject({ cartao: { tipo: "mensagem", id: m.id, status: "rascunho" } });
  });

  it("aprovar a mensagem libera Copiar e WhatsApp; clique duplo não muda nada", async () => {
    const { m } = await cenario();
    const r1 = await decidirItem("mensagem", m.id, "aprovar");
    expect(r1).toMatchObject({ cartao: { status: "aprovado", botoes: ["copiar", "whatsapp", "marcar_enviada"] } });
    const [{ aprovado_em }] = await b.q(`select aprovado_em from public.mensagens where id = $1`, [m.id]);

    const r2 = await decidirItem("mensagem", m.id, "aprovar");
    expect(r2).toMatchObject({ cartao: { status: "aprovado" } });
    const [depois] = await b.q(`select aprovado_em from public.mensagens where id = $1`, [m.id]);
    expect(depois.aprovado_em).toEqual(aprovado_em);
  });

  it("aprovação grava quem aprovou (o usuário da sessão)", async () => {
    const { m, user_id } = await cenario();
    await decidirItem("mensagem", m.id, "aprovar");
    const [linha] = await b.q(`select aprovado_por from public.mensagens where id = $1`, [m.id]);
    expect(linha.aprovado_por).toBe(user_id);
  });

  it("marcarEnviada: antes de aprovar é regra; depois, status enviado", async () => {
    const { m } = await cenario();
    expect(await marcarEnviada(m.id)).toEqual({ erro: "Aprove a mensagem antes de marcar como enviada." });
    await decidirItem("mensagem", m.id, "aprovar");
    expect(await marcarEnviada(m.id)).toMatchObject({ cartao: { status: "enviado", botoes: [] } });
  });

  it("editarItem: muda o rascunho; depois de aprovado devolve a regra", async () => {
    const { m } = await cenario();
    const r = await editarItem("mensagem", m.id, { conteudo: "Texto novo" });
    expect(r).toMatchObject({ cartao: { tipo: "mensagem", texto: "Texto novo" } });
    await decidirItem("mensagem", m.id, "aprovar");
    expect(await editarItem("mensagem", m.id, { conteudo: "Outro" })).toEqual({
      erro: "Este item já foi aprovado.",
    });
  });

  it("editarItem do orçamento revalida a soma no banco", async () => {
    const { o } = await cenario();
    const ok = await editarItem("orcamento", o.id, {
      itens: [
        { descricao: "Mão de obra", valor: "600,00" },
        { descricao: "Material", valor: "200" },
      ],
      validade_dias: 10,
    });
    expect(ok).toMatchObject({ cartao: { tipo: "orcamento", edicao: { validade_dias: 10 } } });
    const ruim = await editarItem("orcamento", o.id, { itens: [{ descricao: "Tudo", valor: 10 }] });
    expect(ruim).toHaveProperty("erro");
    expect((ruim as { erro: string }).erro).not.toMatch(/^regra/);
  });

  it("entrada inválida não chega ao banco", async () => {
    await cenario();
    expect(await verItem("planilha" as never, randomUUID())).toEqual({ erro: "Item não encontrado." });
    expect(await verItem("mensagem", "nao-e-uuid")).toEqual({ erro: "Item não encontrado." });
    expect(await decidirItem("mensagem", randomUUID(), "apagar" as never)).toHaveProperty("erro");
    expect(await editarItem("mensagem", randomUUID(), { conteudo: "" })).toHaveProperty("erro");
  });

  it("item de outro MEI se comporta como inexistente", async () => {
    const outro = await cenario();
    await cenario(); // agora logado como outro usuário
    expect(await verItem("mensagem", outro.m.id)).toEqual({ erro: "Item não encontrado." });
    expect(await decidirItem("mensagem", outro.m.id, "aprovar")).toEqual({ erro: "Item não encontrado." });
    const [linha] = await b.q(`select status from public.mensagens where id = $1`, [outro.m.id]);
    expect(linha.status).toBe("rascunho");
  });

  it("sem sessão não faz nada", async () => {
    const { m } = await cenario();
    h.user = null;
    await expect(decidirItem("mensagem", m.id, "aprovar")).rejects.toThrow("REDIRECT:/login");
  });
});
