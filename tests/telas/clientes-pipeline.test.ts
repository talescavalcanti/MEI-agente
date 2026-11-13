import { describe, expect, it } from "vitest";
import type { Cliente, ServicoListado, ServicoStatus } from "@/lib/dominio/tipos";
import {
  ETAPAS,
  etapaDoCliente,
  filtrarPorNome,
  linkWhatsapp,
  montarQuadro,
  resumoCliente,
} from "@/app/painel/clientes/pipeline";

let seq = 0;
function servico(status: ServicoStatus, extra: Partial<ServicoListado> = {}): ServicoListado {
  seq += 1;
  return {
    id: `s${seq}`,
    mei_id: "m",
    cliente_id: "c1",
    numero: seq,
    descricao: "Serviço",
    valor: 100,
    data_prevista: null,
    local: null,
    forma_pagamento: null,
    status,
    criado_em: "2026-11-01T12:00:00Z",
    atualizado_em: "2026-11-01T12:00:00Z",
    cliente_nome: "Ana",
    cliente_whatsapp: null,
    ...extra,
  } as ServicoListado;
}

function cliente(id: string, nome: string, extra: Partial<Cliente> = {}): Cliente {
  return {
    id,
    mei_id: "m",
    nome,
    whatsapp: null,
    endereco: null,
    observacoes: null,
    documento: null,
    criado_em: "2026-11-01T12:00:00Z",
    atualizado_em: "2026-11-01T12:00:00Z",
    ...extra,
  };
}

describe("etapaDoCliente", () => {
  it("sem serviço é novo contato", () => {
    expect(etapaDoCliente([])).toBe("novo");
  });

  it("só cancelados é novo contato", () => {
    expect(etapaDoCliente([servico("cancelado"), servico("cancelado")])).toBe("novo");
  });

  it.each<ServicoStatus>(["rascunho", "orcado", "aguardando_resposta"])("%s é em negociação", (st) => {
    expect(etapaDoCliente([servico(st)])).toBe("negociacao");
  });

  it.each<ServicoStatus>(["confirmado", "agendado"])("%s é fechado", (st) => {
    expect(etapaDoCliente([servico(st)])).toBe("fechado");
  });

  it("executado é a receber", () => {
    expect(etapaDoCliente([servico("executado")])).toBe("a_receber");
  });

  it("todos pagos é concluído", () => {
    expect(etapaDoCliente([servico("pago"), servico("pago")])).toBe("concluido");
  });

  it("pago com cancelado continua concluído (cancelado é ignorado)", () => {
    expect(etapaDoCliente([servico("pago"), servico("cancelado")])).toBe("concluido");
  });

  it("a receber vence fechado e negociação", () => {
    expect(etapaDoCliente([servico("rascunho"), servico("agendado"), servico("executado")])).toBe("a_receber");
  });

  it("fechado vence negociação", () => {
    expect(etapaDoCliente([servico("orcado"), servico("confirmado")])).toBe("fechado");
  });

  it("negociação vence pago (nem todos estão pagos)", () => {
    expect(etapaDoCliente([servico("pago"), servico("aguardando_resposta")])).toBe("negociacao");
  });

  it("a receber vence pago", () => {
    expect(etapaDoCliente([servico("pago"), servico("executado")])).toBe("a_receber");
  });
});

describe("ETAPAS", () => {
  it("segue a ordem do quadro", () => {
    expect(ETAPAS.map((e) => e.rotulo)).toEqual(["Novo contato", "Em negociação", "Fechado", "A receber", "Concluído"]);
  });
});

describe("resumoCliente", () => {
  it("conta em andamento e soma em aberto só dos executados", () => {
    const r = resumoCliente([
      servico("executado", { valor: 450 }),
      servico("executado", { valor: null }),
      servico("agendado", { valor: 300 }),
      servico("pago", { valor: 900 }),
      servico("cancelado", { valor: 50 }),
    ]);
    expect(r.emAndamento).toBe(3);
    expect(r.emAberto).toBe(450);
  });

  it("próximo passo de a receber cita valor e número", () => {
    const r = resumoCliente([servico("executado", { numero: 7, valor: 450 }), servico("agendado", { numero: 8 })]);
    expect(r.etapa).toBe("a_receber");
    expect(r.proximoPasso).toBe("Receber R$ 450,00 do #007");
  });

  it("a receber sem valor não inventa número", () => {
    const r = resumoCliente([servico("executado", { numero: 7, valor: null })]);
    expect(r.proximoPasso).toBe("Combinar o valor e receber o #007");
  });

  it("fechado cita o agendado mais próximo com data", () => {
    const r = resumoCliente([
      servico("agendado", { numero: 5, data_prevista: "2026-12-01" }),
      servico("agendado", { numero: 4, data_prevista: "2026-11-15" }),
      servico("confirmado", { numero: 6, data_prevista: null }),
    ]);
    expect(r.proximoPasso).toBe("Serviço #004 agendado para 15/11");
  });

  it("fechado confirmado sem data pede para agendar", () => {
    const r = resumoCliente([servico("confirmado", { numero: 12 })]);
    expect(r.proximoPasso).toBe("Serviço #012 confirmado, falta agendar");
  });

  it("negociação prefere o que aguarda resposta", () => {
    const r = resumoCliente([servico("rascunho", { numero: 3 }), servico("aguardando_resposta", { numero: 9 })]);
    expect(r.proximoPasso).toBe("Orçamento #009 aguardando resposta");
  });

  it("negociação orçado e rascunho", () => {
    expect(resumoCliente([servico("rascunho", { numero: 2 }), servico("orcado", { numero: 3 })]).proximoPasso).toBe(
      "Orçamento #003 pronto para enviar",
    );
    expect(resumoCliente([servico("rascunho", { numero: 2 })]).proximoPasso).toBe("Serviço #002 em rascunho");
  });

  it("novo e concluído", () => {
    expect(resumoCliente([]).proximoPasso).toBe("Montar o primeiro orçamento");
    expect(resumoCliente([servico("pago")]).proximoPasso).toBe("Tudo pago");
  });
});

describe("linkWhatsapp", () => {
  it("monta wa.me com 55", () => {
    expect(linkWhatsapp("62999990000")).toBe("https://wa.me/5562999990000");
    expect(linkWhatsapp("(62) 99999-0000")).toBe("https://wa.me/5562999990000");
  });

  it("vazio vira null", () => {
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("  ")).toBeNull();
  });
});

describe("filtrarPorNome", () => {
  const lista = [cliente("1", "João Silva"), cliente("2", "Maria"), cliente("3", "Joana")];

  it("ignora acento e caixa", () => {
    expect(filtrarPorNome(lista, "joao").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarPorNome(lista, "JOA").map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("busca vazia devolve todos", () => {
    expect(filtrarPorNome(lista, "  ")).toHaveLength(3);
    expect(filtrarPorNome(lista, undefined)).toHaveLength(3);
  });
});

describe("montarQuadro", () => {
  it("agrupa cada cliente na sua coluna, em ordem, com quantidade e soma em aberto", () => {
    const clientes = [cliente("a", "Bruno"), cliente("b", "Ana"), cliente("c", "Caio"), cliente("d", "Davi")];
    const servicos = [
      servico("executado", { cliente_id: "a", valor: 200 }),
      servico("executado", { cliente_id: "b", valor: 250.5 }),
      servico("pago", { cliente_id: "c" }),
      servico("cancelado", { cliente_id: "d" }),
    ];
    const quadro = montarQuadro(clientes, servicos);
    expect(quadro.map((c) => c.etapa)).toEqual(["novo", "negociacao", "fechado", "a_receber", "concluido"]);
    const receber = quadro[3];
    expect(receber.cartoes.map((c) => c.cliente.nome)).toEqual(["Ana", "Bruno"]);
    expect(receber.emAberto).toBe(450.5);
    expect(quadro[0].cartoes.map((c) => c.cliente.id)).toEqual(["d"]);
    expect(quadro[4].cartoes.map((c) => c.cliente.id)).toEqual(["c"]);
    expect(quadro[1].cartoes).toEqual([]);
  });
});
