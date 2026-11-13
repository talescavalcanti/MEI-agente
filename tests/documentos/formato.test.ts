import { describe, expect, it } from "vitest";
import { dataExtenso, moeda, telefone } from "@/lib/documentos/formato";

describe("moeda", () => {
  it("formata em reais com espaço comum, vírgula e milhar com ponto", () => {
    expect(moeda(800)).toBe("R$ 800,00");
    expect(moeda(0)).toBe("R$ 0,00");
    expect(moeda(80.5)).toBe("R$ 80,50");
    expect(moeda(1200.5)).toBe("R$ 1.200,50");
    expect(moeda(1234567.891)).toBe("R$ 1.234.567,89");
    expect(moeda(-15)).toBe("-R$ 15,00");
  });

  it("não usa espaço inseparável (o texto vai para o WhatsApp)", () => {
    expect(moeda(800)).not.toMatch(/ /);
  });

  it("recusa valor que não é número finito", () => {
    expect(() => moeda(Number.NaN)).toThrow();
    expect(() => moeda(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("dataExtenso", () => {
  it("escreve a data por extenso com o dia da semana", () => {
    expect(dataExtenso("2026-11-20")).toBe("sexta-feira, 20 de novembro de 2026");
    expect(dataExtenso("2026-03-01")).toBe("domingo, 1 de março de 2026");
    expect(dataExtenso("2027-01-04")).toBe("segunda-feira, 4 de janeiro de 2027");
  });

  it(`não depende do fuso do processo (TZ=${process.env.TZ ?? "padrão"})`, () => {
    // Data pura é dia de calendário: não pode escorregar para o dia anterior.
    expect(dataExtenso("2026-11-20")).toBe("sexta-feira, 20 de novembro de 2026");
    // Instante: vale o dia de São Paulo. 01:00 UTC do dia 21 ainda é dia 20 lá.
    expect(dataExtenso("2026-11-21T01:00:00Z")).toBe("sexta-feira, 20 de novembro de 2026");
    expect(dataExtenso("2026-11-21T03:00:00Z")).toBe("sábado, 21 de novembro de 2026");
  });

  it("recusa data inválida", () => {
    expect(() => dataExtenso("2026-02-31")).toThrow();
    expect(() => dataExtenso("20/11/2026")).toThrow();
    expect(() => dataExtenso("")).toThrow();
  });
});

describe("telefone", () => {
  it("formata celular e fixo com DDD", () => {
    expect(telefone("62999990000")).toBe("(62) 99999-0000");
    expect(telefone("6233330000")).toBe("(62) 3333-0000");
  });

  it("tira o 55 do país e aceita número já pontuado", () => {
    expect(telefone("5562999990000")).toBe("(62) 99999-0000");
    expect(telefone("+55 (62) 9 9999-0000")).toBe("(62) 99999-0000");
  });

  it("sem DDD formata só o número; o que não reconhece volta como veio", () => {
    expect(telefone("999990000")).toBe("99999-0000");
    expect(telefone("33330000")).toBe("3333-0000");
    expect(telefone("190")).toBe("190");
  });
});
