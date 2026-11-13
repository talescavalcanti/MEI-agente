import { describe, expect, it } from "vitest";
import type { ServicoListado, ServicoStatus } from "@/lib/dominio/tipos";
import {
  ETAPAS,
  agruparPorEtapa,
  dataPrevistaCurta,
  filtrarPorEstado,
  numeroServico,
  rotuloEstado,
  vencido,
} from "@/app/painel/servicos/etapas";

let seq = 0;
function servico(dados: Partial<ServicoListado> & { status: ServicoStatus }): ServicoListado {
  seq += 1;
  return {
    id: `s${seq}`,
    mei_id: "m1",
    cliente_id: "c1",
    numero: seq,
    descricao: `Serviço ${seq}`,
    valor: null,
    data_prevista: null,
    local: null,
    forma_pagamento: null,
    criado_em: "2026-11-01T12:00:00Z",
    atualizado_em: "2026-11-01T12:00:00Z",
    cliente_nome: "Maria",
    cliente_whatsapp: null,
    ...dados,
  };
}

const HOJE = "2026-11-14";

describe("ETAPAS", () => {
  it("segue a ordem da máquina de estados, sem cancelado", () => {
    expect(ETAPAS.map((e) => e.status)).toEqual([
      "rascunho",
      "orcado",
      "aguardando_resposta",
      "confirmado",
      "agendado",
      "executado",
      "pago",
    ]);
    expect(ETAPAS.map((e) => e.rotulo)).toEqual([
      "Rascunho",
      "Orçado",
      "Aguardando resposta",
      "Confirmado",
      "Agendado",
      "Executado",
      "Pago",
    ]);
    expect(rotuloEstado("cancelado")).toBe("Cancelado");
  });
});

describe("agruparPorEtapa", () => {
  it("uma coluna por etapa, com quantidade e soma dos valores; cancelados à parte", () => {
    const a = servico({ status: "orcado", valor: 800 });
    const b = servico({ status: "orcado", valor: 250.5 });
    const c = servico({ status: "orcado", valor: null });
    const d = servico({ status: "pago", valor: 100 });
    const x = servico({ status: "cancelado", valor: 999 });

    const { colunas, cancelados } = agruparPorEtapa([a, b, c, d, x]);

    expect(colunas.map((col) => col.status)).toEqual(ETAPAS.map((e) => e.status));
    const orcado = colunas.find((col) => col.status === "orcado")!;
    expect(orcado).toMatchObject({ rotulo: "Orçado", quantidade: 3, total: 1050.5 });
    expect(orcado.servicos.map((s) => s.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(colunas.find((col) => col.status === "pago")).toMatchObject({ quantidade: 1, total: 100 });
    expect(colunas.find((col) => col.status === "rascunho")).toMatchObject({ quantidade: 0, total: 0, servicos: [] });
    expect(cancelados).toEqual([x]);
  });

  it("dentro da coluna, data prevista mais próxima primeiro, sem data no fim, empate pelo número", () => {
    const semData = servico({ status: "confirmado" });
    const dia20 = servico({ status: "confirmado", data_prevista: "2026-11-20" });
    const dia18b = servico({ status: "confirmado", data_prevista: "2026-11-18", numero: 9 });
    const dia18a = servico({ status: "confirmado", data_prevista: "2026-11-18", numero: 3 });

    const { colunas } = agruparPorEtapa([semData, dia20, dia18b, dia18a]);
    const confirmado = colunas.find((col) => col.status === "confirmado")!;
    expect(confirmado.servicos.map((s) => s.id)).toEqual([dia18a.id, dia18b.id, dia20.id, semData.id]);
  });

  it("lista vazia dá as 7 colunas vazias e nenhum cancelado", () => {
    const { colunas, cancelados } = agruparPorEtapa([]);
    expect(colunas).toHaveLength(7);
    expect(colunas.every((col) => col.quantidade === 0 && col.total === 0)).toBe(true);
    expect(cancelados).toEqual([]);
  });

  it("soma sem erro de ponto flutuante", () => {
    const { colunas } = agruparPorEtapa([
      servico({ status: "executado", valor: 0.1 }),
      servico({ status: "executado", valor: 0.2 }),
    ]);
    expect(colunas.find((col) => col.status === "executado")!.total).toBe(0.3);
  });
});

describe("vencido", () => {
  it("data prevista antes de hoje em serviço ainda não executado", () => {
    expect(vencido(servico({ status: "confirmado", data_prevista: "2026-11-13" }), HOJE)).toBe(true);
    expect(vencido(servico({ status: "agendado", data_prevista: "2026-11-01" }), HOJE)).toBe(true);
    expect(vencido(servico({ status: "rascunho", data_prevista: "2026-10-01" }), HOJE)).toBe(true);
  });

  it("hoje, futuro, sem data, executado, pago ou cancelado não vence", () => {
    expect(vencido(servico({ status: "confirmado", data_prevista: HOJE }), HOJE)).toBe(false);
    expect(vencido(servico({ status: "confirmado", data_prevista: "2026-11-15" }), HOJE)).toBe(false);
    expect(vencido(servico({ status: "confirmado" }), HOJE)).toBe(false);
    for (const status of ["executado", "pago", "cancelado"] as const) {
      expect(vencido(servico({ status, data_prevista: "2026-11-01" }), HOJE), status).toBe(false);
    }
  });
});

describe("filtrarPorEstado", () => {
  it("'todos' devolve tudo; um estado devolve só ele", () => {
    const lista = [servico({ status: "pago" }), servico({ status: "cancelado" }), servico({ status: "pago" })];
    expect(filtrarPorEstado(lista, "todos")).toEqual(lista);
    expect(filtrarPorEstado(lista, "pago").map((s) => s.status)).toEqual(["pago", "pago"]);
    expect(filtrarPorEstado(lista, "agendado")).toEqual([]);
  });
});

describe("formatação", () => {
  it("número com 3 dígitos e data prevista curta", () => {
    expect(numeroServico(7)).toBe("#007");
    expect(numeroServico(1234)).toBe("#1234");
    expect(dataPrevistaCurta("2026-11-20")).toBe("20/11/2026");
    expect(dataPrevistaCurta(null)).toBe("Sem data");
  });
});
