import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgendaItem,
  Agendamento,
  Cliente,
  PagamentoResultado,
  Servico,
  ServicoListado,
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

const cliente = (mei: string, dados: Record<string, unknown> = { nome: "Maria Souza" }) =>
  b.rpc("cliente_salvar", { p_mei: mei, p_dados: dados }) as Promise<Cliente>;
const registrar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("servico_registrar", { p_mei: mei, p_dados: dados }) as Promise<Servico>;
const atualizar = (mei: string, id: string, dados: Record<string, unknown>) =>
  b.rpc("servico_atualizar", { p_mei: mei, p_id: id, p_dados: dados }) as Promise<Servico>;
const faltantes = (mei: string, id: string) =>
  b.rpc("servico_faltantes", { p_mei: mei, p_id: id }) as Promise<string[]>;
const mudar = (mei: string, id: string, para: string) =>
  b.rpc("servico_mudar_status", { p_mei: mei, p_id: id, p_para: para }) as Promise<Servico>;
const agendar = (mei: string, id: string, inicio: string, local: string | null = null) =>
  b.rpc("servico_agendar", { p_mei: mei, p_id: id, p_inicio: inicio, p_local: local }) as Promise<Agendamento>;
const pagar = (mei: string, servico: string, valor: number, forma: string | null = "pix") =>
  b.rpc("pagamento_registrar", {
    p_mei: mei,
    p_servico: servico,
    p_valor: valor,
    p_forma: forma,
  }) as Promise<PagamentoResultado>;

/** MEI com um cliente e um serviço de R$ 800 já confirmado. */
async function servicoConfirmado(valor: number | null = 800) {
  const mei = await criarMei(b);
  const c = await cliente(mei);
  const s = await registrar(mei, { cliente_id: c.id, descricao: "Instalação de ar-condicionado", valor, fechado: true });
  return { mei, c, s };
}

describe("servico_registrar", () => {
  it("numera os serviços em sequência por MEI", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    const ca = await cliente(meiA);
    const cb = await cliente(meiB);

    const s1 = await registrar(meiA, { cliente_id: ca.id, descricao: "Instalação" });
    const s2 = await registrar(meiA, { cliente_id: ca.id, descricao: "Manutenção" });
    const outro = await registrar(meiB, { cliente_id: cb.id, descricao: "Limpeza" });

    expect([s1.numero, s2.numero]).toEqual([1, 2]);
    expect(outro.numero).toBe(1);
  });

  it("nasce rascunho, ou confirmado quando o cliente já fechou", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const r = await registrar(mei, { cliente_id: c.id, descricao: "Instalação" });
    const f = await registrar(mei, {
      cliente_id: c.id,
      descricao: "  Instalação de ar-condicionado ",
      valor: 800,
      data_prevista: "2026-11-20",
      local: "Setor Bueno",
      forma_pagamento: "pix",
      fechado: true,
    });
    expect(r.status).toBe("rascunho");
    expect(f).toMatchObject({
      mei_id: mei,
      cliente_id: c.id,
      descricao: "Instalação de ar-condicionado",
      valor: 800,
      data_prevista: "2026-11-20",
      local: "Setor Bueno",
      forma_pagamento: "pix",
      status: "confirmado",
    });
  });

  it("recusa valor zero ou negativo", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    for (const valor of [-5, 0]) {
      await expect(registrar(mei, { cliente_id: c.id, descricao: "x", valor })).rejects.toThrow(
        /^regra: o valor precisa ser maior que zero$/,
      );
    }
    expect(await b.q(`select count(*)::int as n from servicos`)).toEqual([{ n: 0 }]);
  });

  it("recusa sem descrição, forma de pagamento desconhecida e data inválida", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    await expect(registrar(mei, { cliente_id: c.id, descricao: "  " })).rejects.toThrow(
      /^regra: informe a descrição do serviço$/,
    );
    await expect(registrar(mei, { cliente_id: c.id, descricao: "x", forma_pagamento: "boleto" })).rejects.toThrow(
      /^regra: forma de pagamento inválida/,
    );
    await expect(registrar(mei, { cliente_id: c.id, descricao: "x", data_prevista: "sexta" })).rejects.toThrow(
      /^regra: data prevista inválida/,
    );
    for (const valor of ["oitocentos", "NaN"]) {
      await expect(registrar(mei, { cliente_id: c.id, descricao: "x", valor }), valor).rejects.toThrow(
        /^regra: o valor precisa ser maior que zero$/,
      );
    }
  });

  it("cliente de outro MEI ou inventado é cliente não encontrado", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    const ca = await cliente(meiA);
    for (const id of [ca.id, "00000000-0000-4000-8000-000000000000", "cliente-1", null]) {
      await expect(registrar(meiB, { cliente_id: id, descricao: "x" }), String(id)).rejects.toThrow(
        /^regra: cliente não encontrado$/,
      );
    }
    expect(await b.q(`select count(*)::int as n from servicos`)).toEqual([{ n: 0 }]);
  });
});

describe("servico_faltantes", () => {
  it("cenário do README: aponta o que falta e esvazia depois de completar", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei, { nome: "Carlos" });
    const s = await registrar(mei, {
      cliente_id: c.id,
      descricao: "Instalação de ar-condicionado",
      valor: 800,
      data_prevista: "2026-11-20",
      fechado: true,
    });
    expect(s.status).toBe("confirmado");
    expect(await faltantes(mei, s.id)).toEqual(["cliente.whatsapp", "cliente.endereco", "servico.forma_pagamento"]);

    await cliente(mei, { id: c.id, whatsapp: "62 99999-0000", endereco: "Rua 10, Centro" });
    await atualizar(mei, s.id, { forma_pagamento: "pix" });
    expect(await faltantes(mei, s.id)).toEqual([]);
  });

  it("todos os campos, na ordem; local do serviço supre o endereço do cliente", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const s = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    expect(await faltantes(mei, s.id)).toEqual([
      "cliente.whatsapp",
      "cliente.endereco",
      "servico.valor",
      "servico.data_prevista",
      "servico.forma_pagamento",
    ]);
    await atualizar(mei, s.id, { local: "Salão do condomínio" });
    expect(await faltantes(mei, s.id)).not.toContain("cliente.endereco");
  });

  it("serviço de outro MEI é serviço não encontrado", async () => {
    const { s } = await servicoConfirmado();
    const outro = await criarMei(b, "outro");
    await expect(faltantes(outro, s.id)).rejects.toThrow(/^regra: serviço não encontrado$/);
  });
});

describe("servico_atualizar", () => {
  it("atualiza só os campos informados", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const s = await registrar(mei, { cliente_id: c.id, descricao: "Instalação", valor: 800, local: "Centro" });
    const d = await atualizar(mei, s.id, { valor: 850.5, descricao: "", local: null, data_prevista: "2026-11-21" });
    expect(d).toMatchObject({
      id: s.id,
      numero: 1,
      descricao: "Instalação",
      valor: 850.5,
      local: "Centro",
      data_prevista: "2026-11-21",
      status: "rascunho",
    });
  });

  it("não troca o cliente nem o status", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const outro = await cliente(mei, { nome: "Outro" });
    const s = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    const d = await atualizar(mei, s.id, { cliente_id: outro.id, status: "pago", fechado: true });
    expect(d.cliente_id).toBe(c.id);
    expect(d.status).toBe("rascunho");
  });

  it("recusa serviço pago ou cancelado", async () => {
    const { mei, s } = await servicoConfirmado();
    await pagar(mei, s.id, 800);
    await expect(atualizar(mei, s.id, { valor: 900 })).rejects.toThrow(/^regra: /);

    const outro = await servicoConfirmado();
    await mudar(outro.mei, outro.s.id, "cancelado");
    await expect(atualizar(outro.mei, outro.s.id, { valor: 900 })).rejects.toThrow(/^regra: /);
    const [linha] = await b.q(`select valor from servicos where id = $1`, [outro.s.id]);
    expect(Number(linha.valor)).toBe(800);
  });

  it("recusa valor inválido e serviço de outro MEI", async () => {
    const { mei, s } = await servicoConfirmado();
    await expect(atualizar(mei, s.id, { valor: -1 })).rejects.toThrow(/^regra: o valor precisa ser maior que zero$/);
    const outro = await criarMei(b, "outro");
    await expect(atualizar(outro, s.id, { valor: 1 })).rejects.toThrow(/^regra: serviço não encontrado$/);
    await expect(atualizar(mei, "00000000-0000-4000-8000-000000000000", { valor: 1 })).rejects.toThrow(
      /^regra: serviço não encontrado$/,
    );
  });
});

describe("servico_mudar_status", () => {
  it("pago só por pagamento", async () => {
    const { mei, s } = await servicoConfirmado();
    await expect(mudar(mei, s.id, "pago")).rejects.toThrow(/^regra: /);
    const [linha] = await b.q(`select status from servicos where id = $1`, [s.id]);
    expect(linha.status).toBe("confirmado");
  });

  it("transições manuais permitidas", async () => {
    const { mei, s } = await servicoConfirmado();
    expect((await mudar(mei, s.id, "executado")).status).toBe("executado");

    const orcado = await servicoConfirmado();
    await b.q(`update servicos set status = 'orcado' where id = $1`, [orcado.s.id]);
    expect((await mudar(orcado.mei, orcado.s.id, "confirmado")).status).toBe("confirmado");

    const aguardando = await servicoConfirmado();
    await b.q(`update servicos set status = 'aguardando_resposta' where id = $1`, [aguardando.s.id]);
    expect((await mudar(aguardando.mei, aguardando.s.id, "confirmado")).status).toBe("confirmado");

    const agendado = await servicoConfirmado();
    await agendar(agendado.mei, agendado.s.id, "2026-11-20T09:00:00-03:00");
    expect((await mudar(agendado.mei, agendado.s.id, "executado")).status).toBe("executado");
  });

  it("qualquer estado não pago pode ser cancelado; pago não", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const r = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    expect((await mudar(mei, r.id, "cancelado")).status).toBe("cancelado");

    const { mei: m2, s } = await servicoConfirmado();
    await pagar(m2, s.id, 800);
    await expect(mudar(m2, s.id, "cancelado")).rejects.toThrow(/^regra: /);
  });

  it("recusa transição fora da lista e status desconhecido", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const r = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    for (const para of ["confirmado", "executado", "agendado", "orcado", "aguardando_resposta"]) {
      await expect(mudar(mei, r.id, para), para).rejects.toThrow(/^regra: /);
    }
    await expect(mudar(mei, r.id, "voando")).rejects.toThrow(/^regra: status inválido/);

    await mudar(mei, r.id, "cancelado");
    await expect(mudar(mei, r.id, "confirmado")).rejects.toThrow(/^regra: /);
  });

  it("pedir o status em que já está não muda nada", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const r = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    const a = await mudar(mei, r.id, "cancelado");
    const d = await mudar(mei, r.id, "cancelado");
    expect(d).toEqual(a);
  });

  it("serviço de outro MEI é serviço não encontrado", async () => {
    const { s } = await servicoConfirmado();
    const outro = await criarMei(b, "outro");
    await expect(mudar(outro, s.id, "cancelado")).rejects.toThrow(/^regra: serviço não encontrado$/);
    const [linha] = await b.q(`select status from servicos where id = $1`, [s.id]);
    expect(linha.status).toBe("confirmado");
  });
});

describe("servico_agendar", () => {
  it("serviço ainda não confirmado é recusado", async () => {
    const mei = await criarMei(b);
    const c = await cliente(mei);
    const r = await registrar(mei, { cliente_id: c.id, descricao: "x" });
    await expect(agendar(mei, r.id, "2026-11-20T09:00:00-03:00")).rejects.toThrow(
      /^regra: o serviço ainda não foi confirmado pelo cliente$/,
    );
    expect(await b.q(`select count(*)::int as n from agendamentos`)).toEqual([{ n: 0 }]);
  });

  it("agenda serviço confirmado e reagendar substitui", async () => {
    const { mei, s } = await servicoConfirmado();
    await atualizar(mei, s.id, { local: "Setor Bueno" });
    const a = await agendar(mei, s.id, "2026-11-20T09:00:00-03:00");
    expect(a).toMatchObject({ mei_id: mei, servico_id: s.id, local: "Setor Bueno" });
    expect(Date.parse(a.inicio)).toBe(Date.parse("2026-11-20T12:00:00Z"));

    const [depois] = await b.q(`select status, to_char(data_prevista, 'YYYY-MM-DD') as d from servicos where id = $1`, [
      s.id,
    ]);
    expect(depois).toEqual({ status: "agendado", d: "2026-11-20" });

    // 22h em São Paulo do dia 21 já é dia 22 em UTC: a data prevista segue o fuso.
    const r = await agendar(mei, s.id, "2026-11-21T22:00:00-03:00", "Rua 10");
    expect(r.id).toBe(a.id);
    expect(r.local).toBe("Rua 10");
    expect(await b.q(`select count(*)::int as n from agendamentos`)).toEqual([{ n: 1 }]);
    const [re] = await b.q(`select to_char(data_prevista, 'YYYY-MM-DD') as d from servicos where id = $1`, [s.id]);
    expect(re.d).toBe("2026-11-21");
  });

  it("serviço de outro MEI é serviço não encontrado", async () => {
    const { s } = await servicoConfirmado();
    const outro = await criarMei(b, "outro");
    await expect(agendar(outro, s.id, "2026-11-20T09:00:00-03:00")).rejects.toThrow(
      /^regra: serviço não encontrado$/,
    );
  });
});

describe("pagamento_registrar", () => {
  it("300 + 500 num serviço de 800: o 1º deixa 500 em aberto, o 2º leva a pago", async () => {
    const { mei, s } = await servicoConfirmado();
    expect(await pagar(mei, s.id, 300)).toEqual({ pago_total: 300, restante: 500, status: "confirmado" });
    expect(await pagar(mei, s.id, 500, "dinheiro")).toEqual({ pago_total: 800, restante: 0, status: "pago" });
    const [linha] = await b.q(`select status from servicos where id = $1`, [s.id]);
    expect(linha.status).toBe("pago");
    expect(await b.q(`select count(*)::int as n from pagamentos`)).toEqual([{ n: 2 }]);
  });

  it("recusa valor inválido, forma desconhecida, serviço sem valor, cancelado ou já pago", async () => {
    const { mei, s } = await servicoConfirmado();
    await expect(pagar(mei, s.id, 0)).rejects.toThrow(/^regra: o valor precisa ser maior que zero$/);
    await expect(pagar(mei, s.id, 10, "boleto")).rejects.toThrow(/^regra: forma de pagamento inválida/);

    const semValor = await servicoConfirmado(null);
    await expect(pagar(semValor.mei, semValor.s.id, 10)).rejects.toThrow(/^regra: /);

    const cancelado = await servicoConfirmado();
    await mudar(cancelado.mei, cancelado.s.id, "cancelado");
    await expect(pagar(cancelado.mei, cancelado.s.id, 10)).rejects.toThrow(/^regra: /);

    await pagar(mei, s.id, 800);
    await expect(pagar(mei, s.id, 10)).rejects.toThrow(/^regra: /);
    expect(await b.q(`select count(*)::int as n from pagamentos`)).toEqual([{ n: 1 }]);
  });

  it("serviço de outro MEI é serviço não encontrado", async () => {
    const { s } = await servicoConfirmado();
    const outro = await criarMei(b, "outro");
    await expect(pagar(outro, s.id, 10)).rejects.toThrow(/^regra: serviço não encontrado$/);
    expect(await b.q(`select count(*)::int as n from pagamentos`)).toEqual([{ n: 0 }]);
  });
});

describe("servico_listar e agenda_listar", () => {
  it("servico_listar traz o nome do cliente, filtra por status e só do MEI", async () => {
    const { mei, c, s } = await servicoConfirmado();
    const r = await registrar(mei, { cliente_id: c.id, descricao: "Orçamento de limpeza" });
    await servicoConfirmado(); // outro MEI

    const todos = (await b.rpc("servico_listar", { p_mei: mei })) as ServicoListado[];
    expect(todos.map((x) => x.id).sort()).toEqual([s.id, r.id].sort());
    expect(todos.every((x) => x.cliente_nome === "Maria Souza")).toBe(true);

    const rascunhos = (await b.rpc("servico_listar", { p_mei: mei, p_status: "rascunho" })) as ServicoListado[];
    expect(rascunhos.map((x) => x.id)).toEqual([r.id]);
    expect(rascunhos[0]).toMatchObject({ numero: 2, descricao: "Orçamento de limpeza", status: "rascunho" });
  });

  it("agenda_listar devolve os agendamentos do período (dias em São Paulo), em ordem", async () => {
    const a = await servicoConfirmado();
    const mei = a.mei;
    const c = a.c;
    const b2 = await registrar(mei, { cliente_id: c.id, descricao: "Manutenção", fechado: true });
    const fora = await registrar(mei, { cliente_id: c.id, descricao: "Fora", fechado: true });
    const cancelado = await registrar(mei, { cliente_id: c.id, descricao: "Cancelado", fechado: true });

    await agendar(mei, b2.id, "2026-11-22T08:00:00-03:00", "Rua 2");
    await agendar(mei, a.s.id, "2026-11-20T22:30:00-03:00", "Rua 1"); // já é dia 21 em UTC
    await agendar(mei, fora.id, "2026-11-23T08:00:00-03:00");
    await agendar(mei, cancelado.id, "2026-11-21T08:00:00-03:00");
    await mudar(mei, cancelado.id, "cancelado");
    const outro = await servicoConfirmado();
    await agendar(outro.mei, outro.s.id, "2026-11-21T08:00:00-03:00");

    const itens = (await b.rpc("agenda_listar", {
      p_mei: mei,
      p_de: "2026-11-20",
      p_ate: "2026-11-22",
    })) as AgendaItem[];
    expect(itens.map((i) => [i.servico_id, i.local])).toEqual([
      [a.s.id, "Rua 1"],
      [b2.id, "Rua 2"],
    ]);
    expect(itens[0]).toMatchObject({ numero: 1, descricao: "Instalação de ar-condicionado", cliente_nome: "Maria Souza" });
  });
});

describe("03-servicos.sql", () => {
  it("tabelas com RLS ligado e nenhuma política", async () => {
    const rls = await b.q(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('servicos', 'agendamentos', 'pagamentos')
       order by relname`,
    );
    expect(rls).toEqual([
      { relname: "agendamentos", relrowsecurity: true },
      { relname: "pagamentos", relrowsecurity: true },
      { relname: "servicos", relrowsecurity: true },
    ]);
    expect(
      await b.q(`select 1 from pg_policies where tablename in ('servicos', 'agendamentos', 'pagamentos')`),
    ).toEqual([]);
  });

  it("recarregar o SQL não perde dados nem lança (idempotente)", async () => {
    const { mei, s } = await servicoConfirmado();
    await pagar(mei, s.id, 300);
    await carregarSql(b.pg);
    await carregarSql(b.pg);
    const todos = (await b.rpc("servico_listar", { p_mei: mei })) as ServicoListado[];
    expect(todos.map((x) => x.id)).toEqual([s.id]);
    expect(await pagar(mei, s.id, 500)).toMatchObject({ status: "pago" });
  });
});
