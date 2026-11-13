// Contrato de prestação de serviço em PDF (A4), a partir da minuta salva e dos
// dados do banco. `montarPaginas` é o layout puro (lista de desenhos por
// página); `gerarContratoPdf` só mede com a fonte de verdade e desenha.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarDocumento, normalizarDocumento } from "@/lib/fiscal/documento";
import { AVISO_MINUTA } from "./contrato";
import { A_PREENCHER, dataExtenso, moedaOu, telefone, texto } from "./formato";
import { valorTotal } from "./orcamento";
import type { DadosDocumento } from "./tipos";

export type ContratoPdfDados = DadosDocumento & {
  mei: DadosDocumento["mei"] & { cnpj: string | null };
  cliente: DadosDocumento["cliente"] & { documento: string | null };
  /** Texto do contrato como está salvo (`contratos.minuta`). */
  minuta: string;
  aprovado: boolean;
  /** Dia do contrato (`AAAA-MM-DD`, São Paulo). Sem data, sai em branco para preencher. */
  data: string | null;
};

export type Medida = { largura: (texto: string, tamanho: number, negrito: boolean) => number };

export type Op =
  | {
      tipo: "texto";
      x: number;
      /** Linha de base. */
      y: number;
      texto: string;
      tamanho: number;
      negrito: boolean;
      cinza: boolean;
      /** Fica na margem de baixo, fora da área do corpo. */
      rodape: boolean;
    }
  | { tipo: "linha"; x1: number; y1: number; x2: number; y2: number; escura?: boolean }
  | { tipo: "quadro"; x: number; y: number; largura: number; altura: number }
  | { tipo: "marca" };

/** A4 em pontos; margem de 2,5 cm. */
export const LARGURA = 595.28;
export const ALTURA = 841.89;
export const MARGEM = (2.5 / 2.54) * 72;
const UTIL = LARGURA - 2 * MARGEM;

export const MARCA_DAGUA = "MINUTA - RASCUNHO";
const AVISO_RODAPE = "Modelo gerado automaticamente. Revise antes de usar; não substitui orientação jurídica.";
const TITULO = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS";

const CORPO = 10.5;
const ENTRELINHA = 1.45;

// ------------------------------------------------------------------ texto

const TROCAS: Record<string, string> = {
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...", "•": "-", "­": "",
  " ": " ", " ": " ", " ": " ", " ": " ", "\t": " ",
  "​": "", "‌": "", "‍": "", "﻿": "", "\r": "",
};

/** Cabe nas fontes padrão (WinAnsi): ASCII visível e Latin-1. */
const cabe = (c: string) => {
  const n = c.codePointAt(0)!;
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa1 && n <= 0xff) || c === "\n";
};

/**
 * Deixa o texto desenhável com Helvetica (WinAnsi): aspas curvas e travessão
 * viram os equivalentes simples, letra de fora perde o acento e o resto vira `?`.
 */
export function paraWinAnsi(s: string): string {
  let out = "";
  for (const c of s.normalize("NFC")) {
    if (c in TROCAS) out += TROCAS[c];
    else if (cabe(c)) out += c;
    else {
      const base = c.normalize("NFD").replace(/\p{M}/gu, "");
      out += base && [...base].every(cabe) ? base : "?";
    }
  }
  return out;
}

/** Quebra por largura; palavra maior que a linha é cortada. Sempre devolve ao menos uma linha. */
export function quebrarLinhas(texto: string, largura: number, medir: (t: string) => number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/ +/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medir(tentativa) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = "";
    let resto = palavra;
    while (medir(resto) > largura) {
      let n = 1;
      while (n < resto.length && medir(resto.slice(0, n + 1)) <= largura) n++;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  }
  linhas.push(atual);
  return linhas;
}

const ehAssinatura = (l: string) => /^_{5,}$/.test(l) || /\((CONTRATAD[OA]|CONTRATANTE)\)$/.test(l);
const ehLocalEData = (l: string) => /,\s*_+\s+de\s+_+\s+de\s+_+\.?$/.test(l);

/**
 * Parágrafos do texto da minuta, sem o que o PDF já desenha à parte: o aviso,
 * o título, as linhas das partes e o bloco final de local, data e
 * assinaturas. Texto editado à mão fica como está.
 */
export function corpoDaMinuta(minuta: string): string[] {
  let linhas = minuta.replace(/\r/g, "").split("\n").map((l) => l.trimEnd());
  linhas = linhas.filter((l, i) => {
    const t = l.trim();
    if (i === 0 && t === AVISO_MINUTA) return false;
    if (/^CONTRATO DE PRESTAÇÃO DE SERVIÇOS?$/i.test(t)) return false;
    return !/^(CONTRATAD[OA]|CONTRATANTE):/.test(t);
  });
  const fim = linhas.findIndex((l) => ehLocalEData(l.trim()));
  if (fim >= 0 && linhas.slice(fim + 1).every((l) => !l.trim() || ehAssinatura(l.trim()))) {
    linhas = linhas.slice(0, fim);
  }
  return linhas
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** `contrato-012-maria-souza.pdf`: número do serviço e cliente sem acento. */
export function nomeArquivoContrato(numero: number | null, cliente: string | null): string {
  const slug =
    (cliente ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "cliente";
  return ["contrato", numero == null ? null : String(numero).padStart(3, "0"), slug].filter(Boolean).join("-") + ".pdf";
}

// ------------------------------------------------------------------ layout

const doc = (d: string | null) => {
  const t = texto(d);
  if (!t) return null;
  const n = normalizarDocumento(t);
  return { rotulo: n.length === 11 ? "CPF" : n.length === 14 ? "CNPJ" : "CPF/CNPJ", valor: formatarDocumento(t) };
};

/** `13 de novembro de 2026` (sem o dia da semana). */
const dataSemSemana = (ymd: string) => dataExtenso(ymd).replace(/^[^,]*,\s*/, "");

/**
 * Layout do contrato: uma lista de desenhos por página, em pontos, com y de
 * baixo para cima como no PDF. Linha nenhuma passa das margens; o que não
 * cabe vai inteiro para a página seguinte.
 */
export function montarPaginas(d: ContratoPdfDados, m: Medida): Op[][] {
  const paginas: Op[][] = [];
  let atual: Op[] = [];
  let cursor = 0;

  const nova = () => {
    atual = d.aprovado ? [] : [{ tipo: "marca" }];
    paginas.push(atual);
    cursor = ALTURA - MARGEM;
  };
  const garantir = (h: number) => {
    if (cursor - h < MARGEM - 0.001) nova();
  };
  const largura = (t: string, tamanho: number, negrito = false) => m.largura(t, tamanho, negrito);
  const quebrar = (t: string, tamanho: number, negrito: boolean, max: number) =>
    t.split("\n").flatMap((l) => quebrarLinhas(l.trim(), max, (x) => largura(x, tamanho, negrito)));

  type Linha = { texto: string; tamanho: number; negrito?: boolean; cinza?: boolean; centro?: boolean };
  const desenhar = (l: Linha, x = MARGEM, max = UTIL, topo = cursor) => {
    const w = largura(l.texto, l.tamanho, !!l.negrito);
    atual.push({
      tipo: "texto",
      x: l.centro ? x + (max - w) / 2 : x,
      y: topo - l.tamanho,
      texto: l.texto,
      tamanho: l.tamanho,
      negrito: !!l.negrito,
      cinza: !!l.cinza,
      rodape: false,
    });
  };
  const altura = (l: Linha) => l.tamanho * ENTRELINHA;
  const escrever = (l: Linha) => {
    garantir(altura(l));
    desenhar(l);
    cursor -= altura(l);
  };
  const paragrafo = (t: string, tamanho = CORPO, negrito = false, cinza = false) => {
    for (const linha of quebrar(t, tamanho, negrito, UTIL)) escrever({ texto: linha, tamanho, negrito, cinza });
  };

  nova();

  // Cabeçalho do negócio.
  paragrafo(d.mei.nome, 15, true);
  const cnpj = doc(d.mei.cnpj);
  const whats = texto(d.mei.telefone);
  const contato = [cnpj && `CNPJ ${cnpj.valor}`, whats && `WhatsApp ${telefone(whats)}`].filter(Boolean).join(" · ");
  if (contato) paragrafo(contato, 9, false, true);
  cursor -= 6;
  atual.push({ tipo: "linha", x1: MARGEM, y1: cursor, x2: LARGURA - MARGEM, y2: cursor });
  cursor -= 22;

  for (const l of quebrar(TITULO, 13, true, UTIL)) {
    const linha = { texto: l, tamanho: 13, negrito: true, centro: true };
    garantir(altura(linha));
    desenhar(linha);
    cursor -= altura(linha);
  }
  cursor -= 14;

  // Quadro das partes, em duas colunas.
  const PAD = 10;
  const coluna = (UTIL - 3 * PAD) / 2;
  const parte = (rotulo: string, nome: string, detalhes: string[]): Linha[] => [
    { texto: rotulo, tamanho: 8.5, negrito: true, cinza: true },
    ...quebrar(nome, 11, true, coluna).map((t) => ({ texto: t, tamanho: 11, negrito: true })),
    ...detalhes.flatMap((x) => quebrar(x, 9.5, false, coluna).map((t) => ({ texto: t, tamanho: 9.5 }))),
  ];
  const docCliente = doc(d.cliente.documento);
  const zapCliente = texto(d.cliente.whatsapp);
  const contratada = parte("CONTRATADA", d.mei.nome, [
    ...(cnpj ? [`CNPJ: ${cnpj.valor}`] : []),
    ...(texto(d.mei.atividade) ? [`Atividade: ${texto(d.mei.atividade)}`] : []),
    ...(whats ? [`WhatsApp: ${telefone(whats)}`] : []),
    ...(texto(d.mei.cidade) ? [`Cidade: ${texto(d.mei.cidade)}`] : []),
  ]);
  const contratante = parte("CONTRATANTE", texto(d.cliente.nome) ?? A_PREENCHER, [
    ...(docCliente ? [`${docCliente.rotulo}: ${docCliente.valor}`] : []),
    ...(texto(d.cliente.endereco) ? [`Endereço: ${texto(d.cliente.endereco)}`] : []),
    ...(zapCliente ? [`WhatsApp: ${telefone(zapCliente)}`] : []),
  ]);
  const alturaColuna = (ls: Linha[]) => ls.reduce((s, l) => s + altura(l), 0);
  const alturaQuadro = 2 * PAD + Math.max(alturaColuna(contratada), alturaColuna(contratante));
  if (alturaQuadro <= ALTURA - 2 * MARGEM) {
    garantir(alturaQuadro);
    const topo = cursor;
    atual.push({ tipo: "quadro", x: MARGEM, y: topo - alturaQuadro, largura: UTIL, altura: alturaQuadro });
    atual.push({ tipo: "linha", x1: LARGURA / 2, y1: topo - PAD, x2: LARGURA / 2, y2: topo - alturaQuadro + PAD });
    for (const [ls, x] of [
      [contratada, MARGEM + PAD],
      [contratante, MARGEM + 2 * PAD + coluna],
    ] as const) {
      let y = topo - PAD;
      for (const l of ls) {
        desenhar(l, x, coluna, y);
        y -= altura(l);
      }
    }
    cursor = topo - alturaQuadro;
  } else {
    for (const l of [...contratada, ...contratante]) escrever(l);
  }
  cursor -= 16;

  // Objeto e valor.
  paragrafo("OBJETO E VALOR", 9, true, true);
  cursor -= 2;
  const numero = d.servico.numero == null ? "" : ` nº ${String(d.servico.numero).padStart(3, "0")}`;
  paragrafo(`Serviço${numero}: ${texto(d.servico.descricao) ?? A_PREENCHER}`);
  paragrafo(`Local: ${texto(d.servico.local) ?? A_PREENCHER}`);
  paragrafo(`Valor total: ${moedaOu(valorTotal(d))}`, CORPO, true);
  cursor -= 10;
  garantir(1);
  atual.push({ tipo: "linha", x1: MARGEM, y1: cursor, x2: LARGURA - MARGEM, y2: cursor });
  cursor -= 14;

  // Texto da minuta: cláusula com o título em negrito na própria linha.
  for (const p of corpoDaMinuta(d.minuta)) {
    const clausula = /^(CLÁUSULA [^:\n]{1,80}:)\s*([\s\S]*)$/.exec(p);
    // Parágrafo curto não se parte entre páginas (nem deixa linha órfã).
    const linhasP = clausula
      ? 1 + (clausula[2] ? quebrar(clausula[2], CORPO, false, UTIL).length : 0)
      : quebrar(p, CORPO, false, UTIL).length;
    garantir(altura({ texto: "", tamanho: CORPO }) * (linhasP <= 8 ? linhasP : 2));
    if (clausula) {
      const [, titulo, resto] = clausula;
      paragrafo(titulo, CORPO, true);
      if (resto) paragrafo(resto);
    } else {
      paragrafo(p);
    }
    cursor -= CORPO * 0.8;
  }

  // Local e data, e as duas assinaturas: o bloco não se separa.
  cursor -= 8;
  const cidade = texto(d.mei.cidade) ?? A_PREENCHER;
  const quando = d.data ? dataSemSemana(d.data) : "____ de ______________ de ________";
  const larguraAssinatura = (UTIL - 40) / 2;
  const assinaturas: [string, string][] = [
    [d.mei.nome, "CONTRATADA"],
    [texto(d.cliente.nome) ?? A_PREENCHER, "CONTRATANTE"],
  ];
  const nomes = assinaturas.map(([nome]) => quebrar(nome, 10, false, larguraAssinatura));
  const alturaBloco = altura({ texto: "", tamanho: CORPO }) + 48 + Math.max(...nomes.map((n) => n.length)) * 14.5 + 14;
  garantir(alturaBloco);
  paragrafo(`${cidade}, ${quando}.`);
  cursor -= 48;
  const topoAssinatura = cursor;
  assinaturas.forEach(([, papel], i) => {
    const x = MARGEM + i * (larguraAssinatura + 40);
    atual.push({ tipo: "linha", x1: x, y1: topoAssinatura, x2: x + larguraAssinatura, y2: topoAssinatura, escura: true });
    let y = topoAssinatura - 4;
    for (const t of nomes[i]) {
      desenhar({ texto: t, tamanho: 10, centro: true }, x, larguraAssinatura, y);
      y -= 14.5;
    }
    desenhar({ texto: papel, tamanho: 8.5, negrito: true, cinza: true, centro: true }, x, larguraAssinatura, y);
  });

  // Rodapé: só agora se sabe o total de páginas.
  const total = paginas.length;
  const yRodape = MARGEM - 30;
  paginas.forEach((p, i) => {
    const pagina = `Página ${i + 1} de ${total}`;
    const wPagina = largura(pagina, 8);
    const [aviso] = quebrarLinhas(AVISO_RODAPE, UTIL - wPagina - 16, (x) => largura(x, 8));
    p.push({ tipo: "linha", x1: MARGEM, y1: yRodape + 13, x2: LARGURA - MARGEM, y2: yRodape + 13 });
    p.push({ tipo: "texto", x: MARGEM, y: yRodape, texto: aviso, tamanho: 8, negrito: false, cinza: true, rodape: true });
    p.push({
      tipo: "texto",
      x: LARGURA - MARGEM - wPagina,
      y: yRodape,
      texto: pagina,
      tamanho: 8,
      negrito: false,
      cinza: true,
      rodape: true,
    });
  });

  return paginas;
}

// ------------------------------------------------------------------ PDF

const PRETO = rgb(0.09, 0.11, 0.15);
const CINZA = rgb(0.39, 0.42, 0.47);
const TRACO = rgb(0.78, 0.8, 0.84);

function desenharMarca(page: PDFPage, fonte: PDFFont) {
  const tamanho = 64;
  const w = fonte.widthOfTextAtSize(MARCA_DAGUA, tamanho);
  const a = Math.PI / 4;
  // Centro da página, girando em torno do início da linha de base.
  const x = LARGURA / 2 - (w / 2) * Math.cos(a) + (tamanho / 3) * Math.sin(a);
  const y = ALTURA / 2 - (w / 2) * Math.sin(a) - (tamanho / 3) * Math.cos(a);
  page.drawText(MARCA_DAGUA, { x, y, size: tamanho, font: fonte, color: rgb(0.75, 0.77, 0.8), opacity: 0.35, rotate: degrees(45) });
}

/** PDF do contrato. Todo texto passa por `paraWinAnsi` antes de medir e desenhar. */
export async function gerarContratoPdf(d: ContratoPdfDados): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonte = (n: boolean) => (n ? negrito : normal);

  const limpo: ContratoPdfDados = {
    ...d,
    mei: { ...d.mei, nome: paraWinAnsi(d.mei.nome) },
    minuta: paraWinAnsi(d.minuta),
  };
  const medida: Medida = { largura: (t, tamanho, n) => fonte(n).widthOfTextAtSize(paraWinAnsi(t), tamanho) };

  for (const ops of montarPaginas(limpo, medida)) {
    const page = pdf.addPage([LARGURA, ALTURA]);
    for (const op of ops) {
      if (op.tipo === "marca") desenharMarca(page, negrito);
      else if (op.tipo === "texto") {
        page.drawText(paraWinAnsi(op.texto), {
          x: op.x,
          y: op.y,
          size: op.tamanho,
          font: fonte(op.negrito),
          color: op.cinza ? CINZA : PRETO,
        });
      } else if (op.tipo === "linha") {
        page.drawLine({ start: { x: op.x1, y: op.y1 }, end: { x: op.x2, y: op.y2 }, thickness: op.escura ? 0.8 : 0.6, color: op.escura ? CINZA : TRACO });
      } else {
        page.drawRectangle({ x: op.x, y: op.y, width: op.largura, height: op.altura, borderColor: TRACO, borderWidth: 0.8 });
      }
    }
  }

  pdf.setTitle(paraWinAnsi(`Contrato de prestação de serviços - ${d.mei.nome}`));
  pdf.setLanguage("pt-BR");
  pdf.setCreator("MEIagente");
  pdf.setProducer("MEIagente");
  return pdf.save();
}
