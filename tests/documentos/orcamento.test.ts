import { describe, expect, it } from "vitest";
import { renderOrcamento } from "@/lib/documentos/orcamento";
import { dadosCompletos, dadosMinimos } from "./exemplo";

describe("renderOrcamento", () => {
  it("usa os itens, o total e a validade do orçamento", () => {
    expect(renderOrcamento(dadosCompletos())).toEqual({
      titulo: "Orçamento nº 3: Instalação de ar-condicionado split 12.000 BTUs",
      linhas: [
        { descricao: "Mão de obra de instalação", valor: "R$ 650,00" },
        { descricao: "Suporte e tubulação", valor: "R$ 150,00" },
      ],
      total: "R$ 800,00",
      validade: "Válido por 7 dias",
      pagamento: "Pix (chave: joao@exemplo.com)",
    });
  });

  it("sem itens, vira uma linha com o serviço; validade de 1 dia no singular", () => {
    const d = dadosCompletos();
    d.orcamento = { numero: 4, valor: 950, itens: [], validade_dias: 1 };
    const o = renderOrcamento(d);
    expect(o.linhas).toEqual([{ descricao: "Instalação de ar-condicionado split 12.000 BTUs", valor: "R$ 950,00" }]);
    expect(o.total).toBe("R$ 950,00");
    expect(o.validade).toBe("Válido por 1 dia");
  });

  it("sem orçamento, usa o valor e o número do serviço", () => {
    const d = dadosCompletos();
    delete d.orcamento;
    const o = renderOrcamento(d);
    expect(o.titulo).toBe("Orçamento do serviço nº 12: Instalação de ar-condicionado split 12.000 BTUs");
    expect(o.linhas).toEqual([{ descricao: "Instalação de ar-condicionado split 12.000 BTUs", valor: "R$ 800,00" }]);
    expect(o.total).toBe("R$ 800,00");
  });

  it("chave Pix só aparece quando a forma de pagamento é Pix", () => {
    const d = dadosCompletos();
    d.servico.forma_pagamento = "Dinheiro na entrega";
    expect(renderOrcamento(d).pagamento).toBe("Dinheiro na entrega");
  });

  it("dado ausente vira [A PREENCHER], nunca null ou undefined", () => {
    const o = renderOrcamento(dadosMinimos());
    expect(o).toEqual({
      titulo: "Orçamento: Instalação de ar-condicionado",
      linhas: [{ descricao: "Instalação de ar-condicionado", valor: "[A PREENCHER]" }],
      total: "[A PREENCHER]",
      validade: "[A PREENCHER]",
      pagamento: "[A PREENCHER]",
    });
    expect(JSON.stringify(o)).not.toMatch(/null|undefined|NaN/);
  });
});
