import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { AVISO_MINUTA, renderMinuta } from "@/lib/documentos/contrato";
import {
  ALTURA,
  MARGEM,
  corpoDaMinuta,
  gerarContratoPdf,
  montarPaginas,
  nomeArquivoContrato,
  paraWinAnsi,
  quebrarLinhas,
  type ContratoPdfDados,
  type Medida,
} from "@/lib/documentos/contrato-pdf";
import { dadosCompletos } from "../documentos/exemplo";

/** Largura fixa por caractere: o layout fica previsível sem fonte de verdade. */
const medida: Medida = { largura: (t, tamanho, negrito) => t.length * tamanho * (negrito ? 0.6 : 0.5) };

function dados(extra: Partial<ContratoPdfDados> = {}): ContratoPdfDados {
  const base = dadosCompletos();
  return {
    ...base,
    mei: { ...base.mei, cnpj: "12345678000195" },
    cliente: { ...base.cliente, documento: "52998224725" },
    minuta: renderMinuta(base),
    aprovado: true,
    data: "2026-11-13",
    ...extra,
  };
}

const textos = (paginas: ReturnType<typeof montarPaginas>) =>
  paginas.flat().flatMap((op) => (op.tipo === "texto" ? [op.texto] : []));

const minutaLonga = Array.from(
  { length: 60 },
  (_, i) => `CLÁUSULA ${i + 1}ª (DO TESTE): ${"Texto comprido da cláusula para ocupar várias linhas. ".repeat(4)}`,
).join("\n\n");

describe("gerarContratoPdf", () => {
  it("devolve um PDF de uma página A4 para a minuta padrão", async () => {
    const bytes = await gerarContratoPdf(dados());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("minuta longa gera mais de uma página", async () => {
    const pdf = await PDFDocument.load(await gerarContratoPdf(dados({ minuta: minutaLonga })));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("acentos e caracteres fora do WinAnsi não quebram a geração", async () => {
    const minuta = "Aspas “curvas” e ‘simples’ — travessão – meia-risca… emoji 🙂 Ő ação ÇÃO ª º € ✓\tfim";
    const bytes = await gerarContratoPdf(
      dados({ minuta, cliente: { nome: "Zé “Gato” Ñoño 🐱", whatsapp: null, endereco: null, documento: null } }),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("montarPaginas", () => {
  it("marca d'água em toda página só quando o contrato não está aprovado", () => {
    const rascunho = montarPaginas(dados({ aprovado: false, minuta: minutaLonga }), medida);
    expect(rascunho.length).toBeGreaterThan(1);
    for (const p of rascunho) expect(p.filter((op) => op.tipo === "marca")).toHaveLength(1);

    const aprovado = montarPaginas(dados({ aprovado: true, minuta: minutaLonga }), medida);
    expect(aprovado.flat().some((op) => op.tipo === "marca")).toBe(false);
  });

  it("rodapé com aviso e 'Página X de Y' em todas as páginas", () => {
    const paginas = montarPaginas(dados({ minuta: minutaLonga }), medida);
    const total = paginas.length;
    paginas.forEach((p, i) => {
      const t = p.flatMap((op) => (op.tipo === "texto" ? [op.texto] : []));
      expect(t).toContain(`Página ${i + 1} de ${total}`);
      expect(t.some((x) => x.includes("Revise antes de usar"))).toBe(true);
    });
  });

  it("nenhuma linha do corpo sai das margens (quebra de página não corta linha)", () => {
    const paginas = montarPaginas(dados({ minuta: minutaLonga }), medida);
    for (const p of paginas) {
      for (const op of p) {
        if (op.tipo !== "texto" || op.rodape) continue;
        expect(op.y).toBeGreaterThanOrEqual(MARGEM);
        expect(op.y + op.tamanho).toBeLessThanOrEqual(ALTURA - MARGEM + 0.001);
      }
    }
  });

  it("traz cabeçalho, título, partes, objeto e valor, local e data e assinaturas", () => {
    const t = textos(montarPaginas(dados(), medida));
    expect(t).toContain("João Climatização");
    expect(t).toContain("CNPJ 12.345.678/0001-95 · WhatsApp (62) 99999-0000");
    expect(t).toContain("CONTRATO DE PRESTAÇÃO DE SERVIÇOS");
    expect(t).toContain("CONTRATADA");
    expect(t).toContain("CONTRATANTE");
    expect(t).toContain("CPF: 529.982.247-25");
    expect(t).toContain("Endereço: Rua 10, nº 200, Setor Bueno");
    expect(t).toContain("Valor total: R$ 800,00");
    expect(t).toContain("CLÁUSULA 1ª (DO OBJETO):");
    expect(t).toContain("Goiânia, 13 de novembro de 2026.");
    expect(t.filter((x) => x === "Maria Souza")).not.toHaveLength(0);
    // O que já está no quadro e nas assinaturas não se repete do texto da minuta.
    expect(t.some((x) => x.startsWith("CONTRATADO:"))).toBe(false);
    expect(t).not.toContain(AVISO_MINUTA);
  });

  it("sem data (rascunho), local e data ficam em branco para preencher", () => {
    const t = textos(montarPaginas(dados({ data: null, aprovado: false }), medida));
    expect(t).toContain("Goiânia, ____ de ______________ de ________.");
  });

  it("dado ausente vira [A PREENCHER] e campo opcional some", () => {
    const d = dados();
    const t = textos(
      montarPaginas(
        { ...d, mei: { ...d.mei, cnpj: null, telefone: null }, cliente: { nome: null, whatsapp: null, endereco: null, documento: null } },
        medida,
      ),
    );
    expect(t.some((x) => x.startsWith("CNPJ"))).toBe(false);
    expect(t).toContain("[A PREENCHER]");
    expect(t.some((x) => x.startsWith("CPF"))).toBe(false);
  });
});

describe("corpoDaMinuta", () => {
  it("tira aviso, título, partes e assinaturas da minuta padrão e mantém as cláusulas", () => {
    const corpo = corpoDaMinuta(renderMinuta(dadosCompletos()));
    expect(corpo[0]).toBe("As partes acima combinam a prestação de serviço descrita nas cláusulas a seguir.");
    expect(corpo.filter((p) => p.startsWith("CLÁUSULA"))).toHaveLength(6);
    expect(corpo.join("\n")).not.toMatch(/CONTRATADO:|CONTRATANTE:|_{5}|Minuta gerada/);
  });

  it("texto editado fora do modelo é mantido, com parágrafos e quebras de linha", () => {
    expect(corpoDaMinuta("Primeiro parágrafo\ncom duas linhas.\n\n\nSegundo.\r\n")).toEqual([
      "Primeiro parágrafo\ncom duas linhas.",
      "Segundo.",
    ]);
  });

  it("assinatura só sai quando o fim é mesmo o bloco de assinaturas", () => {
    const m = "Cláusula única.\n\nGoiânia, ____ de ______________ de ________.\n\nObservação final do MEI.";
    expect(corpoDaMinuta(m)).toContain("Observação final do MEI.");
  });
});

describe("paraWinAnsi", () => {
  it("troca aspas curvas, travessão e reticências e mantém os acentos", () => {
    expect(paraWinAnsi("“Ação” — ‘é’ – ok…")).toBe('"Ação" - \'é\' - ok...');
    expect(paraWinAnsi("Ç ã õ ê ª º ü")).toBe("Ç ã õ ê ª º ü");
  });

  it("o que não existe no WinAnsi vira letra sem acento ou some", () => {
    expect(paraWinAnsi("Ő✓🙂​ x\ty")).toBe("O?? x y");
  });
});

describe("quebrarLinhas", () => {
  it("quebra por largura sem passar do limite e corta palavra maior que a linha", () => {
    const medir = (t: string) => t.length * 10;
    expect(quebrarLinhas("um dois três quatro", 100, medir)).toEqual(["um dois", "três", "quatro"]);
    expect(quebrarLinhas("abcdefghijklmnop", 50, medir)).toEqual(["abcde", "fghij", "klmno", "p"]);
    expect(quebrarLinhas("", 50, medir)).toEqual([""]);
  });
});

describe("nomeArquivoContrato", () => {
  it("número do serviço e cliente sem acento", () => {
    expect(nomeArquivoContrato(12, "Maria Conceição d'Ávila")).toBe("contrato-012-maria-conceicao-d-avila.pdf");
    expect(nomeArquivoContrato(null, null)).toBe("contrato-cliente.pdf");
    expect(nomeArquivoContrato(7, "🙂")).toBe("contrato-007-cliente.pdf");
  });
});
