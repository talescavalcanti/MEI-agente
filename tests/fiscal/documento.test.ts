import { describe, expect, it } from "vitest";
import { documentoValido, formatarDocumento } from "@/lib/fiscal/documento";

// Mesmos casos do Step 1 da Task 17a (`documento_valido` no SQL): os dois
// algoritmos precisam aceitar e recusar exatamente as mesmas entradas.
describe("documentoValido", () => {
  it("CPF e CNPJ válidos conhecidos passam e voltam só com dígitos", () => {
    expect(documentoValido("52998224725")).toBe("52998224725");
    expect(documentoValido("12345678909")).toBe("12345678909");
    expect(documentoValido("11222333000181")).toBe("11222333000181");
    expect(documentoValido("12345678000195")).toBe("12345678000195");
  });

  it("formatação com pontos, traço, barra e espaço é aceita", () => {
    expect(documentoValido("529.982.247-25")).toBe("52998224725");
    expect(documentoValido(" 11.222.333/0001-81 ")).toBe("11222333000181");
  });

  it("um dígito trocado é recusado", () => {
    expect(documentoValido("52998224724")).toBeNull();
    expect(documentoValido("52998224735")).toBeNull();
    expect(documentoValido("11222333000182")).toBeNull();
    expect(documentoValido("11222333000191")).toBeNull();
    expect(documentoValido("62998224725")).toBeNull();
  });

  it("sequência repetida é recusada, mesmo com dígito verificador que fecha", () => {
    expect(documentoValido("111.111.111-11")).toBeNull();
    expect(documentoValido("00000000000")).toBeNull();
    expect(documentoValido("99999999999")).toBeNull();
    expect(documentoValido("00000000000000")).toBeNull();
    expect(documentoValido("11111111111111")).toBeNull();
  });

  it("tamanho diferente de 11 ou 14 dígitos, vazio ou nulo é recusado", () => {
    expect(documentoValido("")).toBeNull();
    expect(documentoValido("5299822472")).toBeNull();
    expect(documentoValido("529982247250")).toBeNull();
    expect(documentoValido("1122233300018")).toBeNull();
    expect(documentoValido("112223330001810")).toBeNull();
    expect(documentoValido(null)).toBeNull();
    expect(documentoValido(undefined)).toBeNull();
  });
});

describe("formatarDocumento", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("aceita entrada já formatada e devolve o resto como veio", () => {
    expect(formatarDocumento("123.456.789-09")).toBe("123.456.789-09");
    expect(formatarDocumento("123")).toBe("123");
  });
});
