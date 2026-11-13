import { describe, expect, it } from "vitest";
import { AVISO_MINUTA, renderMinuta } from "@/lib/documentos/contrato";
import { dadosCompletos, dadosMinimos } from "./exemplo";

const AVISO = "Minuta gerada automaticamente. Revise antes de usar; não substitui orientação jurídica.";

describe("renderMinuta", () => {
  it("a primeira linha é o aviso obrigatório, texto exato", () => {
    expect(AVISO_MINUTA).toBe(AVISO);
    expect(renderMinuta(dadosCompletos()).split("\n")[0]).toBe(AVISO);
    expect(renderMinuta(dadosMinimos()).split("\n")[0]).toBe(AVISO);
  });

  it("traz as cláusulas fixas com os dados do banco", () => {
    const t = renderMinuta(dadosCompletos());
    expect(t).toContain("CLÁUSULA 1ª (DO OBJETO)");
    expect(t).toContain("Instalação de ar-condicionado split 12.000 BTUs");
    expect(t).toContain("CLÁUSULA 2ª (DO PREÇO E DO PAGAMENTO)");
    expect(t).toContain("R$ 800,00");
    expect(t).toContain("Pix, chave joao@exemplo.com");
    expect(t).toContain("CLÁUSULA 3ª (DO PRAZO)");
    expect(t).toContain("sexta-feira, 20 de novembro de 2026");
    expect(t).toContain("CLÁUSULA 4ª (DAS OBRIGAÇÕES)");
    expect(t).toContain("CLÁUSULA 5ª (DA RESCISÃO)");
    expect(t).toContain("CLÁUSULA 6ª (DO FORO)");
    expect(t).toMatch(/foro da comarca de Goiânia/);
    expect(t).toContain("Maria Souza");
    expect(t).toContain("(62) 98888-7777");
    expect(t).toContain("Rua 10, nº 200, Setor Bueno");
    expect(t).not.toContain("[A PREENCHER]");
  });

  it("usa o valor do orçamento quando existe", () => {
    const d = dadosCompletos();
    d.orcamento!.valor = 950;
    expect(renderMinuta(d)).toContain("R$ 950,00");
  });

  it("sem endereço do cliente, mostra [A PREENCHER] no lugar", () => {
    const d = dadosCompletos();
    d.cliente.endereco = null;
    const t = renderMinuta(d);
    expect(t).toMatch(/residente em \[A PREENCHER\]/);
    expect(t.startsWith(AVISO)).toBe(true);
  });

  it("todos os campos opcionais nulos: [A PREENCHER], nunca null nem undefined", () => {
    const t = renderMinuta(dadosMinimos());
    expect(t).not.toMatch(/null|undefined|NaN/);
    expect(t).toMatch(/foro da comarca de \[A PREENCHER\]/);
    expect(t).toMatch(/CONTRATANTE: \[A PREENCHER\]/);
    // Preço, data, local, forma de pagamento, endereço, telefone etc.
    expect(t.match(/\[A PREENCHER\]/g)!.length).toBeGreaterThanOrEqual(10);
  });

  it("texto vazio conta como ausente", () => {
    const d = dadosCompletos();
    d.mei.cidade = "   ";
    expect(renderMinuta(d)).toMatch(/foro da comarca de \[A PREENCHER\]/);
  });

  it("cláusula extra aparece numerada depois das fixas; extra vazia é ignorada", () => {
    const t = renderMinuta(dadosCompletos(), [
      "O CONTRATADO dá garantia de 90 dias sobre a instalação.",
      "  ",
      "O CONTRATANTE fornece a escada.",
    ]);
    const i6 = t.indexOf("CLÁUSULA 6ª");
    const i7 = t.indexOf("CLÁUSULA 7ª: O CONTRATADO dá garantia de 90 dias sobre a instalação.");
    const i8 = t.indexOf("CLÁUSULA 8ª: O CONTRATANTE fornece a escada.");
    expect(i6).toBeGreaterThan(0);
    expect(i7).toBeGreaterThan(i6);
    expect(i8).toBeGreaterThan(i7);
    expect(t).not.toContain("CLÁUSULA 9ª");
  });

  it("é determinística e sem travessão", () => {
    const a = renderMinuta(dadosCompletos(), ["Extra."]);
    expect(renderMinuta(dadosCompletos(), ["Extra."])).toBe(a);
    expect(a).not.toMatch(/[–—]/);
  });
});
