import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CODIGOS_SUGERIDOS, sugerirCodigos } from "@/lib/fiscal/codigos";
import { lerNfse } from "@/lib/fiscal/xml";

const FIXTURE = readFileSync(new URL("./fixtures/nfse-exemplo.xml", import.meta.url), "utf8");
const NAO_E_NFSE = { erro: "Este arquivo não parece ser uma NFS-e." };

describe("lerNfse", () => {
  it("lê todos os campos da NFS-e de exemplo", () => {
    expect(lerNfse(FIXTURE)).toEqual({
      numero_nfse: "42",
      chave_acesso: "52087072212345678000195000000000004226111234567890",
      valor: 1500,
      tomador_documento: "11222333000181",
      competencia: "2026-11-08",
      codigo_tributacao: "140101",
    });
  });

  it("pega o documento do tomador, não o do prestador nem o do emitente", () => {
    const r = lerNfse(FIXTURE);
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.tomador_documento).not.toBe("12345678000195");
  });

  it("tomador pessoa física (CPF)", () => {
    const xml = FIXTURE.replace("<CNPJ>11222333000181</CNPJ>", "<CPF>52998224725</CPF>");
    expect(lerNfse(xml)).toMatchObject({ tomador_documento: "52998224725" });
  });

  it("tomador com CNPJ alfanumérico (fora do XSD v1.01, que ainda só aceita dígitos)", () => {
    const xml = FIXTURE.replace("<CNPJ>11222333000181</CNPJ>", "<CNPJ>12ABC34501DE35</CNPJ>");
    expect(lerNfse(xml)).toMatchObject({ tomador_documento: "12ABC34501DE35" });
  });

  it("valor com ponto ou com vírgula é lido certo", () => {
    const comVirgula = FIXTURE.replace("<vServ>1500.00</vServ>", "<vServ>1.234,56</vServ>");
    expect(lerNfse(comVirgula)).toMatchObject({ valor: 1234.56 });
    const soVirgula = FIXTURE.replace("<vServ>1500.00</vServ>", "<vServ>80,5</vServ>");
    expect(lerNfse(soVirgula)).toMatchObject({ valor: 80.5 });
    const semDecimal = FIXTURE.replace("<vServ>1500.00</vServ>", "<vServ>800</vServ>");
    expect(lerNfse(semDecimal)).toMatchObject({ valor: 800 });
    const ponto = FIXTURE.replace("<vServ>1500.00</vServ>", "<vServ>799.9</vServ>");
    expect(lerNfse(ponto)).toMatchObject({ valor: 799.9 });
  });

  it("aceita prefixo de namespace nas tags", () => {
    const xml = FIXTURE.replace(/<(\/?)(?!\?|!)([A-Za-z])/g, "<$1n:$2").replace(
      'xmlns="http://www.sped.fazenda.gov.br/nfse"',
      'xmlns:n="http://www.sped.fazenda.gov.br/nfse"',
    );
    expect(lerNfse(xml)).toMatchObject({ numero_nfse: "42", valor: 1500, tomador_documento: "11222333000181" });
  });

  it("sem Id na infNFSe, a chave fica null e o resto é lido", () => {
    const xml = FIXTURE.replace(/<infNFSe Id="[^"]*">/, "<infNFSe>");
    expect(lerNfse(xml)).toMatchObject({ numero_nfse: "42", chave_acesso: null });
  });

  it("sem cTribNac, código fica null", () => {
    const xml = FIXTURE.replace("<cTribNac>140101</cTribNac>", "");
    expect(lerNfse(xml)).toMatchObject({ codigo_tributacao: null });
  });

  it("XML de outro tipo não é NFS-e", () => {
    expect(lerNfse('<?xml version="1.0"?><nfeProc><NFe><infNFe/></NFe></nfeProc>')).toEqual(NAO_E_NFSE);
    expect(lerNfse("")).toEqual(NAO_E_NFSE);
    expect(lerNfse("isto não é xml")).toEqual(NAO_E_NFSE);
    // Só a DPS (declaração), sem a NFS-e gerada em volta: não tem número.
    const soDps = FIXTURE.slice(FIXTURE.indexOf("<DPS"), FIXTURE.indexOf("</DPS>") + 6);
    expect(lerNfse(soDps)).toEqual(NAO_E_NFSE);
  });

  it("NFS-e sem campo obrigatório (tomador, valor ou competência) é recusada", () => {
    expect(lerNfse(FIXTURE.replace(/<toma>[\s\S]*<\/toma>/, ""))).toEqual(NAO_E_NFSE);
    expect(lerNfse(FIXTURE.replace("<vServ>1500.00</vServ>", ""))).toEqual(NAO_E_NFSE);
    expect(lerNfse(FIXTURE.replace("<dCompet>2026-11-08</dCompet>", ""))).toEqual(NAO_E_NFSE);
    expect(lerNfse(FIXTURE.replace("<vServ>1500.00</vServ>", "<vServ>abc</vServ>"))).toEqual(NAO_E_NFSE);
  });
});

describe("CODIGOS_SUGERIDOS", () => {
  it("todo código tem o formato do XSD (cTribNac 6 dígitos, NBS 9)", () => {
    expect(CODIGOS_SUGERIDOS.length).toBeGreaterThan(0);
    for (const c of CODIGOS_SUGERIDOS) {
      expect(c.codigo_tributacao).toMatch(/^[0-9]{6}$/);
      if (c.nbs !== null) expect(c.nbs).toMatch(/^[0-9]{9}$/);
      // NBS escolhido pela descrição: o cartão pede para o MEI conferir.
      expect(c.nbs_conferido).toBe(false);
      expect(c.descricao.length).toBeGreaterThan(0);
    }
  });
});

describe("sugerirCodigos", () => {
  it('"Técnico de manutenção" acha a linha', () => {
    const r = sugerirCodigos("Técnico de manutenção");
    expect(r.map((c) => c.atividade)).toContain("Técnico de manutenção");
    expect(r.map((c) => c.codigo_tributacao)).toContain("140101");
  });

  it("busca sem acento e sem caixa", () => {
    expect(sugerirCodigos("TECNICO DE MANUTENCAO").map((c) => c.codigo_tributacao)).toContain("140101");
    expect(sugerirCodigos("fotografo").map((c) => c.codigo_tributacao)).toEqual(["130301"]);
    expect(sugerirCodigos("Eletricista residencial").every((c) => c.atividade === "Eletricista")).toBe(true);
  });

  it("ar-condicionado e refrigeração caem no técnico de manutenção", () => {
    expect(sugerirCodigos("Técnico de ar-condicionado").length).toBeGreaterThan(0);
    expect(sugerirCodigos("Refrigeração").every((c) => c.atividade === "Técnico de manutenção")).toBe(true);
  });

  it("atividade vazia ou nula devolve a lista toda; sem par, lista vazia", () => {
    expect(sugerirCodigos(null)).toEqual(CODIGOS_SUGERIDOS);
    expect(sugerirCodigos("  ")).toEqual(CODIGOS_SUGERIDOS);
    expect(sugerirCodigos("Advogado")).toEqual([]);
    expect(sugerirCodigos("e")).toEqual([]);
    expect(sugerirCodigos("tecnico").map((c) => c.codigo_tributacao)).toEqual(["140101", "140601"]);
  });
});
