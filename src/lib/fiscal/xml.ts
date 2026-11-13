/*
 * Leitura do XML da NFS-e emitida no padrão nacional (Emissor Nacional).
 *
 * STEP 0 da Task 17 (itens 1 e 2), conferido em 13/11/2026 na documentação
 * técnica oficial, "Documentação Atual (Produção)":
 *   https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
 * A página avisa que são minutas até a homologação pelo CGNFS.
 *
 * Fontes usadas:
 *   - Esquemas XSD v1.01 (pacote nfse-esquemas_xsd-v1-01-20260209.zip):
 *     NFSe_v1.01.xsd, tiposComplexos_v1.01.xsd, tiposSimples_v1.01.xsd.
 *   - Anexo B, lista de serviços nacional e NBS
 *     (anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx).
 *
 * 1. Formato dos códigos (tiposSimples_v1.01.xsd)
 *   - cTribNac (TSCodTribNac): pattern [0-9]{6}. São 2 dígitos do item da
 *     LC 116/2003, 2 do subitem e 2 do desdobro nacional (ex.: 140101).
 *     No Anexo B (aba LISTA.SERV.NAC.) o código está gravado como número,
 *     sem o zero à esquerda: 70202 = 070202.
 *   - cNBS (TSCodNBS): pattern [0-9]{9}. No Anexo B (aba LISTA.NBS_v2.0) vem
 *     com pontos: 1.2001.81.00 = 120018100. No XSD, cNBS é opcional
 *     (minOccurs 0 em TCCServ).
 *   - O Anexo B não traz correspondência entre cTribNac e NBS. O NBS de
 *     `codigos.ts` foi escolhido pela descrição.
 *
 * 2. Layout da NFS-e (NFSe_v1.01.xsd, namespace http://www.sped.fazenda.gov.br/nfse)
 *   NFSe/infNFSe/@Id ............ "NFS" + 50 dígitos (TSIdNFSe). Os 50 dígitos
 *                                  são a chave de acesso (TSChaveNFSe, [0-9]{50}):
 *                                  mun.(7) + amb.(1) + tipo insc.(1) + insc.(14)
 *                                  + nº NFS-e(13) + AAMM(4) + cód.(9) + DV(1).
 *   NFSe/infNFSe/nNFSe .......... número da NFS-e ([1-9][0-9]{0,12})
 *   NFSe/infNFSe/DPS/infDPS/dCompet ............... competência, AAAA-MM-DD
 *   NFSe/infNFSe/DPS/infDPS/toma/CNPJ | toma/CPF .. tomador (14 ou 11 dígitos;
 *                                  o grupo `toma` é opcional e também aceita
 *                                  NIF ou cNaoNIF, de tomador estrangeiro)
 *   NFSe/infNFSe/DPS/infDPS/serv/cServ/cTribNac ... código de tributação nacional
 *   NFSe/infNFSe/DPS/infDPS/serv/cServ/cNBS ....... NBS (opcional)
 *   NFSe/infNFSe/DPS/infDPS/valores/vServPrest/vServ  valor do serviço
 *                                  (TSDec15V2: ponto decimal, 2 casas)
 *   Cuidado: `prest` (prestador) e `emit` (emitente) também têm CNPJ/CPF. O
 *   tomador só pode ser lido de dentro de `toma`.
 *
 * A documentação oficial não traz XML de exemplo de NFS-e emitida. A fixture
 * (tests/fiscal/fixtures/nfse-exemplo.xml) foi montada pelo XSD e conferida
 * com um validador XSD.
 *
 * Não há DOMParser no Node e não entra dependência nova: parser mínimo por
 * regex. Ele aceita prefixo de namespace nas tags e ignora comentários. Só
 * lê os campos acima.
 */
import type { ErroLeituraNfse, NfseLida } from "./tipos";

const NAO_E_NFSE: ErroLeituraNfse = { erro: "Este arquivo não parece ser uma NFS-e." };

/** Abre e fecha de uma tag pelo nome local, com ou sem prefixo de namespace. */
function bloco(xml: string, nome: string): { atributos: string; conteudo: string } | null {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${nome}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nome}\\s*>`,
  );
  const m = re.exec(xml);
  return m ? { atributos: m[1] ?? "", conteudo: m[2] } : null;
}

/** Texto de uma tag simples, sem espaços nas pontas. */
function texto(xml: string, nome: string): string | null {
  const b = bloco(xml, nome);
  if (!b) return null;
  const t = b.conteudo.trim();
  return t && !t.includes("<") ? t : null;
}

/** `1500.00`, `1.234,56`, `80,5` e `800` → número. Outro formato → null. */
function lerValor(bruto: string | null): number | null {
  if (!bruto) return null;
  const s = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Lê os campos conferidos de uma NFS-e emitida. Sem número, tomador
 * (CPF/CNPJ), valor ou competência, o arquivo não serve para a conferência e
 * volta `{ erro }`.
 */
export function lerNfse(xml: string): NfseLida | ErroLeituraNfse {
  const limpo = xml.replace(/<!--[\s\S]*?-->/g, "");

  const nfse = bloco(limpo, "NFSe");
  const inf = nfse && bloco(nfse.conteudo, "infNFSe");
  if (!inf) return NAO_E_NFSE;

  const numero = texto(inf.conteudo, "nNFSe");
  const infDps = bloco(inf.conteudo, "infDPS");
  if (!numero || !/^[1-9]\d{0,12}$/.test(numero) || !infDps) return NAO_E_NFSE;

  const toma = bloco(infDps.conteudo, "toma");
  const tomador = toma && (texto(toma.conteudo, "CNPJ") ?? texto(toma.conteudo, "CPF"));
  const servPrest = bloco(infDps.conteudo, "vServPrest");
  const valor = lerValor(servPrest && texto(servPrest.conteudo, "vServ"));
  const competencia = texto(infDps.conteudo, "dCompet");
  if (!tomador || !/^(\d{11}|\d{14})$/.test(tomador)) return NAO_E_NFSE;
  if (valor === null || !competencia || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return NAO_E_NFSE;

  const id = /\bId\s*=\s*"NFS(\d{50})"/.exec(inf.atributos);
  const cServ = bloco(infDps.conteudo, "cServ");
  const codigo = cServ && texto(cServ.conteudo, "cTribNac");

  return {
    numero_nfse: numero,
    chave_acesso: id ? id[1] : null,
    valor,
    tomador_documento: tomador,
    competencia,
    codigo_tributacao: codigo && /^\d{6}$/.test(codigo) ? codigo : null,
  };
}
