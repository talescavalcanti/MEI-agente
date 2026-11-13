import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  Cliente,
  Contrato,
  ItemDecisao,
  ItemVisto,
  Mensagem,
  Orcamento,
  Servico,
} from "@/lib/dominio/tipos";
import { abrirBancoTeste, carregarSql, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

// Abrir o PGlite com todo o SQL passa dos 10s padrão do hook quando a suíte
// inteira roda em paralelo; mesmo teto do testTimeout.
beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const regra = (frase?: string) => (frase ? `regra: ${frase}` : /^regra: /);

const cliente = (mei: string, dados: Record<string, unknown> = { nome: "Maria Souza" }) =>
  b.rpc("cliente_salvar", { p_mei: mei, p_dados: dados }) as Promise<Cliente>;
const registrar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("servico_registrar", { p_mei: mei, p_dados: dados }) as Promise<Servico>;
const servico = async (mei: string, id: string) =>
  (await b.q(`select * from public.servicos where id = $1 and mei_id = $2`, [id, mei]))[0] as Servico;
const gerar = (mei: string, servicoId: string, itens?: unknown, validade?: number) =>
  b.rpc("orcamento_gerar", {
    p_mei: mei,
    p_servico: servicoId,
    p_itens: itens,
    p_validade: validade,
  }) as Promise<Orcamento>;
const contrato = (mei: string, servicoId: string, minuta: string) =>
  b.rpc("contrato_salvar", { p_mei: mei, p_servico: servicoId, p_minuta: minuta }) as Promise<Contrato>;
const rascunhar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("mensagem_rascunhar", { p_mei: mei, p_dados: dados }) as Promise<Mensagem>;
const decidir = (mei: string, tipo: string, id: string, decisao: string, user: string | null) =>
  b.rpc("item_decidir", { p_mei: mei, p_tipo: tipo, p_id: id, p_decisao: decisao, p_user: user }) as Promise<ItemDecisao>;
const editar = (mei: string, tipo: string, id: string, dados: Record<string, unknown>) =>
  b.rpc("item_editar", { p_mei: mei, p_tipo: tipo, p_id: id, p_dados: dados }) as Promise<Record<string, unknown>>;
const enviada = (mei: string, id: string) =>
  b.rpc("mensagem_marcar_enviada", { p_mei: mei, p_id: id }) as Promise<Mensagem>;
const ver = (mei: string, tipo: string, id: string) =>
  b.rpc("item_ver", { p_mei: mei, p_tipo: tipo, p_id: id }) as Promise<ItemVisto>;

/** Usuário dono do MEI (quem aprova). */
const dono = async (mei: string) =>
  ((await b.q(`select user_id from public.meis where id = $1`, [mei]))[0] as { user_id: string }).user_id;

/** MEI com cliente e serviço de R$ 800 em rascunho. */
async function cenario(valor: number | null = 800, fechado = false) {
  const mei = await criarMei(b, "Refrigeração do Zé");
  const c = await cliente(mei, { nome: "Maria Souza", whatsapp: "62 9 9999-0000", endereco: "Rua 1, Goiânia" });
  const s = await registrar(mei, {
    cliente_id: c.id,
    descricao: "Instalação de ar-condicionado",
    valor,
    data_prevista: "2026-11-20",
    forma_pagamento: "pix",
    fechado,
  });
  return { mei, c, s, user: await dono(mei) };
}

describe("schema", () => {
  it("o SQL é idempotente (rodar de novo não quebra)", async () => {
    await carregarSql(b.pg);
  });
});

describe("orcamento_gerar", () => {
  it("serviço sem valor → regra", async () => {
    const { mei, s } = await cenario(null);
    await expect(gerar(mei, s.id)).rejects.toThrow(regra("defina o valor do serviço antes do orçamento"));
  });

  it("sem itens, cria um item com a descrição e o valor; serviço rascunho vira orcado", async () => {
    const { mei, s } = await cenario();
    const o = await gerar(mei, s.id);
    expect(o).toMatchObject({
      servico_id: s.id,
      numero: s.numero,
      valor: 800,
      itens: [{ descricao: "Instalação de ar-condicionado", valor: 800 }],
      validade_dias: 7,
      status: "rascunho",
      aprovado_em: null,
      enviado_em: null,
    });
    expect((await servico(mei, s.id)).status).toBe("orcado");
  });

  it("itens que não somam o valor do serviço → regra", async () => {
    const { mei, s } = await cenario();
    const itens = [
      { descricao: "Instalação", valor: 500 },
      { descricao: "Material", valor: 200 },
    ];
    await expect(gerar(mei, s.id, itens)).rejects.toThrow(regra());
  });

  it("itens que somam o valor são aceitos, com validade própria", async () => {
    const { mei, s } = await cenario();
    const itens = [
      { descricao: "Instalação", valor: 600 },
      { descricao: "Material", valor: 200 },
    ];
    const o = await gerar(mei, s.id, itens, 15);
    expect(o.itens).toEqual(itens);
    expect(o.validade_dias).toBe(15);
  });

  it("item sem descrição ou com valor inválido → regra", async () => {
    const { mei, s } = await cenario();
    await expect(gerar(mei, s.id, [{ descricao: "", valor: 800 }])).rejects.toThrow(regra());
    await expect(gerar(mei, s.id, [{ descricao: "Tudo", valor: -800 }])).rejects.toThrow(regra());
    await expect(gerar(mei, s.id, [{ descricao: "Tudo", valor: "oito" }])).rejects.toThrow(regra());
  });

  it("refaz o rascunho (mesmo id); recusa se já aprovado", async () => {
    const { mei, s, user } = await cenario();
    const o1 = await gerar(mei, s.id);
    const o2 = await gerar(mei, s.id, [
      { descricao: "A", valor: 400 },
      { descricao: "B", valor: 400 },
    ]);
    expect(o2.id).toBe(o1.id);
    expect(o2.itens).toHaveLength(2);

    await decidir(mei, "orcamento", o2.id, "aprovar", user);
    await expect(gerar(mei, s.id)).rejects.toThrow(regra());
  });

  it("serviço já confirmado não muda de status", async () => {
    const { mei, s } = await cenario(800, true);
    await gerar(mei, s.id);
    expect((await servico(mei, s.id)).status).toBe("confirmado");
  });

  it("serviço de outro MEI → regra", async () => {
    const { s } = await cenario();
    const outro = await criarMei(b, "Outro");
    await expect(gerar(outro, s.id)).rejects.toThrow(regra());
  });
});

describe("contrato_salvar", () => {
  it("cria, refaz o rascunho e recusa depois de aprovado", async () => {
    const { mei, s, user } = await cenario();
    const k1 = await contrato(mei, s.id, "Minuta 1");
    expect(k1).toMatchObject({ servico_id: s.id, minuta: "Minuta 1", status: "rascunho" });
    const k2 = await contrato(mei, s.id, "Minuta 2");
    expect(k2.id).toBe(k1.id);
    expect(k2.minuta).toBe("Minuta 2");

    await decidir(mei, "contrato", k2.id, "aprovar", user);
    await expect(contrato(mei, s.id, "Minuta 3")).rejects.toThrow(regra());
  });

  it("minuta vazia → regra", async () => {
    const { mei, s } = await cenario();
    await expect(contrato(mei, s.id, "   ")).rejects.toThrow(regra());
  });
});

describe("mensagem_rascunhar", () => {
  it("cria rascunho; conteúdo vazio ou longo demais → regra", async () => {
    const { mei, c, s } = await cenario();
    const m = await rascunhar(mei, {
      canal: "whatsapp",
      objetivo: "confirmacao",
      conteudo: "Oi Maria, tudo certo para dia 20?",
      servico_id: s.id,
    });
    expect(m).toMatchObject({ cliente_id: c.id, servico_id: s.id, status: "rascunho", enviado_em: null });

    await expect(rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "  " })).rejects.toThrow(regra());
    await expect(
      rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "a".repeat(2001) }),
    ).rejects.toThrow(regra());
    await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "a".repeat(2000) });
  });

  it("canal ou objetivo inválido → regra", async () => {
    const { mei } = await cenario();
    await expect(rascunhar(mei, { canal: "email", objetivo: "outro", conteudo: "oi" })).rejects.toThrow(regra());
    await expect(rascunhar(mei, { canal: "whatsapp", objetivo: "spam", conteudo: "oi" })).rejects.toThrow(regra());
  });

  it("cliente ou serviço de outro MEI (ou inventado) → regra", async () => {
    const { c, s } = await cenario();
    const outro = await criarMei(b, "Outro");
    const base = { canal: "whatsapp", objetivo: "outro", conteudo: "oi" };
    await expect(rascunhar(outro, { ...base, cliente_id: c.id })).rejects.toThrow(regra("cliente não encontrado"));
    await expect(rascunhar(outro, { ...base, servico_id: s.id })).rejects.toThrow(regra("serviço não encontrado"));
    await expect(rascunhar(outro, { ...base, cliente_id: "inventado" })).rejects.toThrow(regra("cliente não encontrado"));
  });
});

describe("item_decidir (Review Focus 1)", () => {
  it("aprovar duas vezes: a 2ª não muda nada e mantém aprovado_em", async () => {
    const { mei, s, user } = await cenario();
    const o = await gerar(mei, s.id);

    const r1 = await decidir(mei, "orcamento", o.id, "aprovar", user);
    expect(r1).toEqual({ tipo: "orcamento", id: o.id, status: "aprovado", mudou: true });
    const [a1] = await b.q(`select aprovado_em, aprovado_por from public.orcamentos where id = $1`, [o.id]);
    expect(a1.aprovado_em).not.toBeNull();
    expect(a1.aprovado_por).toBe(user);

    const r2 = await decidir(mei, "orcamento", o.id, "aprovar", user);
    expect(r2).toEqual({ tipo: "orcamento", id: o.id, status: "aprovado", mudou: false });
    const [a2] = await b.q(`select aprovado_em from public.orcamentos where id = $1`, [o.id]);
    expect(a2.aprovado_em).toEqual(a1.aprovado_em);
  });

  it("aprovar depois de descartar: continua descartado, mudou false", async () => {
    const { mei, user } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    expect(await decidir(mei, "mensagem", m.id, "descartar", user)).toMatchObject({ status: "descartado", mudou: true });
    expect(await decidir(mei, "mensagem", m.id, "aprovar", user)).toEqual({
      tipo: "mensagem",
      id: m.id,
      status: "descartado",
      mudou: false,
    });
    const [linha] = await b.q(`select aprovado_em from public.mensagens where id = $1`, [m.id]);
    expect(linha.aprovado_em).toBeNull();
  });

  it("descartar depois de aprovar: continua aprovado", async () => {
    const { mei, s, user } = await cenario();
    const k = await contrato(mei, s.id, "Minuta");
    await decidir(mei, "contrato", k.id, "aprovar", user);
    expect(await decidir(mei, "contrato", k.id, "descartar", user)).toMatchObject({ status: "aprovado", mudou: false });
  });

  it("id de outro MEI ou inexistente → regra: item não encontrado", async () => {
    const { mei, s, user } = await cenario();
    const o = await gerar(mei, s.id);
    const outro = await criarMei(b, "Outro");
    await expect(decidir(outro, "orcamento", o.id, "aprovar", user)).rejects.toThrow(regra("item não encontrado"));
    await expect(
      decidir(mei, "mensagem", "00000000-0000-0000-0000-000000000000", "aprovar", user),
    ).rejects.toThrow(regra("item não encontrado"));
    // id certo, tipo errado
    await expect(decidir(mei, "contrato", o.id, "aprovar", user)).rejects.toThrow(regra("item não encontrado"));
    const [linha] = await b.q(`select status from public.orcamentos where id = $1`, [o.id]);
    expect(linha.status).toBe("rascunho");
  });

  it("tipo ou decisão inválida → regra", async () => {
    const { mei, s, user } = await cenario();
    const o = await gerar(mei, s.id);
    await expect(decidir(mei, "post", o.id, "aprovar", user)).rejects.toThrow(regra());
    await expect(decidir(mei, "orcamento", o.id, "enviar", user)).rejects.toThrow(regra());
  });
});

describe("item_editar", () => {
  it("edita rascunho de mensagem, contrato e orçamento", async () => {
    const { mei, s } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    expect(await editar(mei, "mensagem", m.id, { conteudo: "olá" })).toMatchObject({ id: m.id, conteudo: "olá" });

    const k = await contrato(mei, s.id, "Minuta");
    expect(await editar(mei, "contrato", k.id, { minuta: "Minuta revisada" })).toMatchObject({
      minuta: "Minuta revisada",
    });

    const o = await gerar(mei, s.id);
    const itens = [
      { descricao: "Mão de obra", valor: 300 },
      { descricao: "Material", valor: 500 },
    ];
    expect(await editar(mei, "orcamento", o.id, { itens, validade_dias: 10 })).toMatchObject({
      itens,
      validade_dias: 10,
    });
  });

  it("orçamento: itens que não somam → regra; conteúdo de mensagem vazio → regra", async () => {
    const { mei, s } = await cenario();
    const o = await gerar(mei, s.id);
    await expect(editar(mei, "orcamento", o.id, { itens: [{ descricao: "X", valor: 100 }] })).rejects.toThrow(regra());
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    await expect(editar(mei, "mensagem", m.id, { conteudo: "" })).rejects.toThrow(regra());
  });

  it("item aprovado → regra: este item já foi aprovado", async () => {
    const { mei, user } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    await decidir(mei, "mensagem", m.id, "aprovar", user);
    await expect(editar(mei, "mensagem", m.id, { conteudo: "outra" })).rejects.toThrow(
      regra("este item já foi aprovado"),
    );
  });

  it("id de outro MEI → regra: item não encontrado", async () => {
    const { mei } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    const outro = await criarMei(b, "Outro");
    await expect(editar(outro, "mensagem", m.id, { conteudo: "x" })).rejects.toThrow(regra("item não encontrado"));
  });
});

describe("mensagem_marcar_enviada", () => {
  it("rascunho → regra: aprove a mensagem antes de marcar como enviada", async () => {
    const { mei } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    await expect(enviada(mei, m.id)).rejects.toThrow(regra("aprove a mensagem antes de marcar como enviada"));
  });

  it("envio de orçamento: preenche enviado_em do orçamento e leva o serviço a aguardando_resposta", async () => {
    const { mei, s, user } = await cenario();
    const o = await gerar(mei, s.id);
    await decidir(mei, "orcamento", o.id, "aprovar", user);
    const m = await rascunhar(mei, {
      canal: "whatsapp",
      objetivo: "envio_orcamento",
      conteudo: "Segue o orçamento",
      servico_id: s.id,
    });
    await decidir(mei, "mensagem", m.id, "aprovar", user);

    const r = await enviada(mei, m.id);
    expect(r.status).toBe("enviado");
    expect(r.enviado_em).not.toBeNull();
    const [orc] = await b.q(`select enviado_em from public.orcamentos where id = $1`, [o.id]);
    expect(orc.enviado_em).not.toBeNull();
    expect((await servico(mei, s.id)).status).toBe("aguardando_resposta");

    // Clique duplo: não muda nada.
    const r2 = await enviada(mei, m.id);
    expect(r2.enviado_em).toBe(r.enviado_em);
  });

  it("mensagem de outro MEI → regra", async () => {
    const { mei, user } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    await decidir(mei, "mensagem", m.id, "aprovar", user);
    const outro = await criarMei(b, "Outro");
    await expect(enviada(outro, m.id)).rejects.toThrow(regra());
  });
});

describe("item_ver", () => {
  it("devolve item e dados no formato DadosDocumento", async () => {
    const { mei, s } = await cenario();
    const o = await gerar(mei, s.id, [
      { descricao: "Mão de obra", valor: 300 },
      { descricao: "Material", valor: 500 },
    ]);
    const v = await ver(mei, "orcamento", o.id);
    expect(v.item).toMatchObject({ id: o.id, status: "rascunho" });
    expect(v.mei).toEqual({
      nome: "Refrigeração do Zé",
      atividade: null,
      cidade: null,
      telefone: null,
      chave_pix: null,
    });
    expect(v.cliente).toEqual({ nome: "Maria Souza", whatsapp: "62999990000", endereco: "Rua 1, Goiânia" });
    expect(v.servico).toEqual({
      numero: s.numero,
      descricao: "Instalação de ar-condicionado",
      valor: 800,
      data_prevista: "2026-11-20",
      local: null,
      forma_pagamento: "pix",
    });
    expect(v.orcamento).toEqual({
      numero: s.numero,
      valor: 800,
      itens: [
        { descricao: "Mão de obra", valor: 300 },
        { descricao: "Material", valor: 500 },
      ],
      validade_dias: 7,
    });
  });

  it("contrato sem orçamento: orcamento null; mensagem avulsa: cliente e serviço null", async () => {
    const { mei, s } = await cenario();
    const k = await contrato(mei, s.id, "Minuta");
    const vk = await ver(mei, "contrato", k.id);
    expect(vk.item).toMatchObject({ minuta: "Minuta" });
    expect(vk.orcamento).toBeNull();
    expect(vk.servico?.descricao).toBe("Instalação de ar-condicionado");

    const m = await rascunhar(mei, { canal: "instagram", objetivo: "post", conteudo: "Promoção!" });
    const vm = await ver(mei, "mensagem", m.id);
    expect(vm.cliente).toBeNull();
    expect(vm.servico).toBeNull();
    expect(vm.mei.nome).toBe("Refrigeração do Zé");
  });

  it("id de outro MEI → regra: item não encontrado", async () => {
    const { mei, s } = await cenario();
    const o = await gerar(mei, s.id);
    const outro = await criarMei(b, "Outro");
    await expect(ver(outro, "orcamento", o.id)).rejects.toThrow(regra("item não encontrado"));
  });
});
