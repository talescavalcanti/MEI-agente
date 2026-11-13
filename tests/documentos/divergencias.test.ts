import { describe, expect, it } from "vitest";
import { valoresDivergentes } from "@/lib/documentos/divergencias";

describe("valoresDivergentes (Review Focus 5)", () => {
  it("acha valor diferente do serviço", () => {
    expect(valoresDivergentes("Valor combinado: R$ 80", 800)).toEqual(["R$ 80,00"]);
  });

  it("valor igual escrito de vários jeitos não diverge", () => {
    for (const texto of [
      "R$ 800,00 no Pix",
      "R$800",
      "R$ 800",
      "Fica R$ 800,00.",
      "São 800 reais",
      "800,00 reais",
      "r$ 800,0",
    ]) {
      expect(valoresDivergentes(texto, 800), texto).toEqual([]);
    }
  });

  it("entende milhar com ponto e centavos com vírgula", () => {
    expect(valoresDivergentes("Total de R$ 1.200,50", 1200.5)).toEqual([]);
    expect(valoresDivergentes("Total de R$ 1.200,50", 1200)).toEqual(["R$ 1.200,50"]);
    expect(valoresDivergentes("R$ 1.200", 1200)).toEqual([]);
    expect(valoresDivergentes("R$ 1200", 1200)).toEqual([]);
  });

  it("número solto sem R$ nem reais não é valor", () => {
    expect(valoresDivergentes("Vou no dia 20, apto 800, às 14h", 800)).toEqual([]);
    expect(valoresDivergentes("Vou no dia 20, apto 801", 800)).toEqual([]);
    expect(valoresDivergentes("Split de 12.000 BTUs, 2 anos de garantia", 800)).toEqual([]);
  });

  it("texto sem valor devolve lista vazia", () => {
    expect(valoresDivergentes("Oi Maria, tudo certo para sexta?", 800)).toEqual([]);
    expect(valoresDivergentes("", 800)).toEqual([]);
  });

  it("lista cada valor divergente uma vez, na ordem em que aparece", () => {
    expect(
      valoresDivergentes("Entrada de R$ 400 e mais 400 reais na entrega. Total R$ 800. Ou R$ 80 se for à vista.", 800),
    ).toEqual(["R$ 400,00", "R$ 80,00"]);
  });

  it("aceita 'mil' e 'reais' colado", () => {
    expect(valoresDivergentes("Fica 1 mil reais", 800)).toEqual(["R$ 1.000,00"]);
    expect(valoresDivergentes("R$ 1,2 mil", 1200)).toEqual([]);
    expect(valoresDivergentes("800reais", 800)).toEqual([]);
  });
});
