// Lógica dos cartões de aprovação, só no servidor (importa `@/lib/dominio/mei`,
// que é server-only). As actions devolvem um `CartaoDados` já montado: o
// navegador recebe o que vai mostrar, não a linha crua do banco. O `Cartao.tsx`
// importa daqui só tipos.

import { AVISO_MINUTA } from "@/lib/documentos/contrato";
import { valoresDivergentes } from "@/lib/documentos/divergencias";
import { moeda } from "@/lib/documentos/formato";
import { renderOrcamento, type OrcamentoRenderizado } from "@/lib/documentos/orcamento";
import { mensagemDeRegra } from "@/lib/dominio/mei";
import type {
  Contrato,
  ItemDecisaoPedido,
  ItemEdicao,
  ItemStatus,
  ItemTipo,
  ItemVisto,
  Mensagem,
  NotaAviso,
  NotaCampoConferido,
  NotaEmissaoDados,
  NotaFiscal,
  NotaStatus,
  Orcamento,
  OrcamentoItem,
} from "@/lib/dominio/tipos";
import { CODIGOS_SUGERIDOS } from "@/lib/fiscal/codigos";
import { formatarDocumento } from "@/lib/fiscal/documento";
import { lerNfse } from "@/lib/fiscal/xml";

export type Botao = "aprovar" | "editar" | "descartar" | "copiar" | "whatsapp" | "marcar_enviada";

type Base = {
  id: string;
  status: ItemStatus;
  titulo: string;
  botoes: Botao[];
};

export type CartaoDados =
  | (Base & {
      tipo: "orcamento";
      orcamento: OrcamentoRenderizado;
      edicao: { itens: OrcamentoItem[]; validade_dias: number };
    })
  | (Base & {
      tipo: "contrato";
      aviso: string;
      /** A minuta sem o aviso da primeira linha (o cartão mostra o aviso à parte). */
      texto: string;
      /** Página de impressão (Task 14). */
      documento: string;
      edicao: { minuta: string };
    })
  | (Base & {
      tipo: "mensagem";
      /** Para quem: nome do cliente, "Instagram" ou null. */
      para: string | null;
      texto: string;
      /** `https://wa.me/55…?text=…`, só com whatsapp do cliente e canal whatsapp. */
      whatsapp: string | null;
      /** Valores citados no texto que não batem com o do serviço (aviso âmbar). */
      divergentes: string[];
      valorServico: string | null;
      edicao: { conteudo: string };
    });

/** O que toda action devolve. */
export type ResultadoCartao = { cartao: CartaoDados } | { erro: string };

export const TIPOS: readonly ItemTipo[] = ["orcamento", "contrato", "mensagem"];
const DECISOES: readonly ItemDecisaoPedido[] = ["aprovar", "descartar"];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ERRO_NAO_ENCONTRADO = "Item não encontrado.";
const ERRO_GENERICO = "Não deu certo agora. Tente de novo em instantes.";

export function tipoValido(t: unknown): t is ItemTipo {
  return typeof t === "string" && (TIPOS as readonly string[]).includes(t);
}

export function idValido(id: unknown): id is string {
  return typeof id === "string" && GUID.test(id);
}

export function decisaoValida(d: unknown): d is ItemDecisaoPedido {
  return typeof d === "string" && (DECISOES as readonly string[]).includes(d);
}

/** Erro de action: `regra:` vira a frase; o resto vai para o log e vira mensagem genérica. */
export function erroDeAcao(e: unknown): { erro: string } {
  const frase = mensagemDeRegra(e);
  if (frase) return { erro: frase };
  console.error("acao do cartao falhou:", e);
  return { erro: ERRO_GENERICO };
}

/**
 * `https://wa.me/55<dígitos>?text=…`. O whatsapp é gravado só com dígitos, com
 * DDD e sem o 55; máscara ou 55 na frente são tolerados. Sem número com DDD → null.
 */
export function linkWhatsApp(whatsapp: string | null | undefined, texto: string): string | null {
  let d = (whatsapp ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return `https://wa.me/55${d}?text=${encodeURIComponent(texto)}`;
}

/** `"1.200,50"`, `"800"`, `800.5` → número em reais. Inválido → NaN. */
function reais(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const s = v.replace(/R\$/i, "").trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}

export type Validacao = { ok: true; dados: ItemEdicao } | { ok: false; erro: string };

/**
 * Valida o que veio do formulário de edição, conforme o tipo. Só os campos
 * daquele tipo passam; o resto é descartado. A soma do orçamento quem confere
 * é o banco (`item_editar`).
 */
export function validarEdicao(tipo: ItemTipo, dados: unknown): Validacao {
  const d = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;

  if (tipo === "mensagem") {
    const conteudo = typeof d.conteudo === "string" ? d.conteudo.trim() : "";
    if (!conteudo) return { ok: false, erro: "Escreva o texto da mensagem." };
    if (conteudo.length > 2000) return { ok: false, erro: "A mensagem passa de 2000 caracteres." };
    return { ok: true, dados: { conteudo } };
  }

  if (tipo === "contrato") {
    const minuta = typeof d.minuta === "string" ? d.minuta.trim() : "";
    if (!minuta) return { ok: false, erro: "A minuta não pode ficar vazia." };
    return { ok: true, dados: { minuta } };
  }

  const saida: { itens?: OrcamentoItem[]; validade_dias?: number } = {};
  if (d.itens !== undefined) {
    if (!Array.isArray(d.itens) || d.itens.length === 0 || d.itens.length > 50) {
      return { ok: false, erro: "Informe ao menos um item." };
    }
    const itens: OrcamentoItem[] = [];
    for (const bruto of d.itens) {
      const i = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
      const descricao = typeof i.descricao === "string" ? i.descricao.trim() : "";
      if (!descricao || descricao.length > 200) return { ok: false, erro: "Todo item precisa de uma descrição." };
      const valor = reais(i.valor);
      if (!Number.isFinite(valor) || valor < 0) {
        return { ok: false, erro: `Valor inválido no item "${descricao}".` };
      }
      itens.push({ descricao, valor: Math.round(valor * 100) / 100 });
    }
    saida.itens = itens;
  }
  if (d.validade_dias !== undefined) {
    const n = typeof d.validade_dias === "string" ? Number(d.validade_dias.trim()) : d.validade_dias;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 365) {
      return { ok: false, erro: "A validade precisa ser de 1 a 365 dias." };
    }
    saida.validade_dias = n;
  }
  return { ok: true, dados: saida };
}

function botoes(tipo: ItemTipo, status: ItemStatus, whatsapp: string | null): Botao[] {
  if (status === "rascunho") return ["aprovar", "editar", "descartar"];
  if (tipo === "mensagem" && status === "aprovado") {
    return whatsapp ? ["copiar", "whatsapp", "marcar_enviada"] : ["copiar", "marcar_enviada"];
  }
  return [];
}

/** Monta o que o cartão mostra a partir do `item_ver`. */
export function montarCartao(tipo: ItemTipo, v: ItemVisto): CartaoDados {
  if (tipo === "orcamento") {
    const o = v.item as Orcamento;
    const orcamento = renderOrcamento({
      mei: v.mei,
      cliente: v.cliente ?? { nome: null, whatsapp: null, endereco: null },
      servico: v.servico ?? {
        numero: o.numero,
        descricao: "",
        valor: o.valor,
        data_prevista: null,
        local: null,
        forma_pagamento: null,
      },
      orcamento: v.orcamento ?? { numero: o.numero, valor: o.valor, itens: o.itens, validade_dias: o.validade_dias },
    });
    return {
      tipo,
      id: o.id,
      status: o.status,
      titulo: orcamento.titulo,
      botoes: botoes(tipo, o.status, null),
      orcamento,
      edicao: { itens: o.itens, validade_dias: o.validade_dias },
    };
  }

  if (tipo === "contrato") {
    const c = v.item as Contrato;
    const texto = c.minuta.startsWith(AVISO_MINUTA) ? c.minuta.slice(AVISO_MINUTA.length).trim() : c.minuta;
    const servico = v.servico?.descricao;
    return {
      tipo,
      id: c.id,
      status: c.status,
      titulo: servico ? `Minuta de contrato: ${servico}` : "Minuta de contrato",
      botoes: botoes(tipo, c.status, null),
      aviso: AVISO_MINUTA,
      texto,
      documento: `/painel/documentos/contrato/${c.id}`,
      edicao: { minuta: c.minuta },
    };
  }

  const m = v.item as Mensagem;
  const whatsapp = m.canal === "whatsapp" ? linkWhatsApp(v.cliente?.whatsapp, m.conteudo) : null;
  const valor = v.orcamento?.valor ?? v.servico?.valor ?? null;
  const para = m.canal === "instagram" ? "Instagram" : (v.cliente?.nome ?? null);
  return {
    tipo,
    id: m.id,
    status: m.status,
    titulo: m.canal === "instagram" ? "Post para o Instagram" : para ? `Mensagem para ${para}` : "Mensagem",
    botoes: botoes(tipo, m.status, whatsapp),
    para,
    texto: m.conteudo,
    whatsapp,
    divergentes: valor === null ? [] : valoresDivergentes(m.conteudo, valor),
    valorServico: valor === null ? null : moeda(valor),
    edicao: { conteudo: m.conteudo },
  };
}

// ---------------------------------------------------------------- nota fiscal

/**
 * Login do Emissor Nacional da NFS-e (conferido em 13/11/2026: é a página de
 * acesso do contribuinte em nfse.gov.br, com entrada pelo gov.br para MEI).
 */
export const EMISSOR_NACIONAL_URL = "https://www.nfse.gov.br/EmissorNacional/Login";

export type BotaoNota = "aprovar" | "descartar" | "emissor" | "registrar" | "mandar";

/** Um campo do cartão, na ordem em que aparece no Emissor Nacional. */
export type CampoNota = { rotulo: string; valor: string; copiar: string; observacao?: string };

export type DiferencaNota = { rotulo: string; esperado: string; emitido: string };

export type CartaoNotaDados = {
  tipo: "nota";
  id: string;
  status: NotaStatus;
  titulo: string;
  campos: CampoNota[];
  avisos: NotaAviso[];
  avisosConfirmados: boolean;
  /** Só na nota divergente: o que a nota emitida trouxe diferente do rascunho. */
  diferencas: DiferencaNota[];
  numeroNfse: string | null;
  /** `dd/mm/aaaa` (São Paulo). */
  emitidaEm: string | null;
  botoes: BotaoNota[];
  emissorUrl: string;
  /** Link do agente com o pedido da mensagem de envio (só nota emitida). */
  pedidoEnvio: string | null;
};

export type ResultadoNota = { cartao: CartaoNotaDados } | { erro: string };

export const ERRO_NOTA_NAO_ENCONTRADA = "Nota não encontrada.";

/** `2026-11-08` → `08/11/2026`. Outro formato volta como veio. */
function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Instante ISO → `dd/mm/aaaa` no fuso de São Paulo. */
function diaSP(instante: string): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return instante;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** `140101` → `14.01.01`. */
function codigoTributacao(c: string): string {
  return /^\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c;
}

/** `120018100` → `1.2001.81.00` (como na tabela oficial de NBS). */
function codigoNbs(c: string): string {
  return /^\d{9}$/.test(c) ? `${c[0]}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : c;
}

/** NBS sugerido por descrição, sem correspondência oficial com o código de tributação. */
const NBS_A_CONFERIR = new Set(CODIGOS_SUGERIDOS.filter((c) => c.nbs && !c.nbs_conferido).map((c) => c.nbs));

const ROTULO_DIFERENCA: Record<NotaCampoConferido, string> = {
  valor: "Valor",
  tomador_documento: "CPF ou CNPJ do tomador",
  competencia: "Competência",
  codigo_tributacao: "Código de tributação",
};

function valorDiferenca(campo: NotaCampoConferido, v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "não informado";
  if (campo === "valor") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? moeda(n) : String(v);
  }
  if (campo === "tomador_documento") return formatarDocumento(String(v));
  if (campo === "competencia") return dataBr(String(v));
  return codigoTributacao(String(v));
}

function botoesNota(status: NotaStatus): BotaoNota[] {
  if (status === "rascunho") return ["aprovar", "descartar"];
  if (status === "aprovado" || status === "divergente") return ["emissor", "registrar"];
  if (status === "emitida") return ["mandar"];
  return [];
}

/**
 * Monta o cartão de nota. Os campos seguem a ordem do Emissor Nacional
 * (tomador, competência, serviço, valores), cada um com o texto para copiar.
 */
export function montarCartaoNota(
  n: NotaFiscal,
  ctx: { clienteNome: string | null; municipioMei: string | null },
): CartaoNotaDados {
  const doc = formatarDocumento(n.tomador_documento);
  const valor = moeda(n.valor);
  const competencia = dataBr(n.competencia);
  const codigo = codigoTributacao(n.codigo_tributacao);

  const campos: CampoNota[] = [
    { rotulo: n.tomador_documento.length === 11 ? "CPF do tomador" : "CNPJ do tomador", valor: doc, copiar: doc },
  ];
  if (ctx.clienteNome) campos.push({ rotulo: "Nome do tomador", valor: ctx.clienteNome, copiar: ctx.clienteNome });
  campos.push(
    { rotulo: "Competência", valor: competencia, copiar: competencia },
    { rotulo: "Código de tributação nacional", valor: codigo, copiar: codigo },
  );
  if (n.nbs) {
    const nbs = codigoNbs(n.nbs);
    const campo: CampoNota = { rotulo: "NBS", valor: nbs, copiar: nbs };
    if (NBS_A_CONFERIR.has(n.nbs)) campo.observacao = "confira o NBS";
    campos.push(campo);
  }
  const municipio = n.municipio_prestacao ?? ctx.municipioMei;
  if (municipio) campos.push({ rotulo: "Município da prestação", valor: municipio, copiar: municipio });
  campos.push(
    { rotulo: "Descrição do serviço", valor: n.descricao, copiar: n.descricao },
    { rotulo: "Valor do serviço", valor, copiar: valor.replace(/^R\$\s*/, "") },
  );

  const diferencas: DiferencaNota[] = [];
  if (n.status === "divergente" && n.conferencia) {
    for (const campo of Object.keys(ROTULO_DIFERENCA) as NotaCampoConferido[]) {
      const d = n.conferencia[campo];
      if (!d) continue;
      diferencas.push({
        rotulo: ROTULO_DIFERENCA[campo],
        esperado: valorDiferenca(campo, d.esperado),
        emitido: valorDiferenca(campo, d.emitido),
      });
    }
  }

  const para = ctx.clienteNome ? ` para ${ctx.clienteNome}` : "";
  const pedido =
    n.status === "emitida"
      ? `Prepare a mensagem de envio da nota fiscal nº ${n.numero_nfse ?? ""}${para} (nota_id ${n.id}).`
      : null;

  return {
    tipo: "nota",
    id: n.id,
    status: n.status,
    titulo: `Nota fiscal nº ${n.numero_seq}${para}${n.parcial ? " (parcial)" : ""}`,
    campos,
    avisos: n.avisos.map(({ codigo, texto }) => ({ codigo, texto })),
    avisosConfirmados: n.avisos_confirmados,
    diferencas,
    numeroNfse: n.numero_nfse,
    emitidaEm: n.emitida_em ? diaSP(n.emitida_em) : null,
    botoes: botoesNota(n.status),
    emissorUrl: EMISSOR_NACIONAL_URL,
    pedidoEnvio: pedido ? `/painel/agente?pedido=${encodeURIComponent(pedido)}` : null,
  };
}

/** Teto do XML da NFS-e aceito no registro da emissão. */
export const XML_MAX_BYTES = 200 * 1024;

export type EntradaEmissao = {
  xml?: { nome: string; tamanho: number; texto: string } | null;
  numero?: string | null;
  valor?: string | null;
};

/**
 * O que vai para `nota_registrar_emissao`: do XML (só os campos lidos por
 * `lerNfse`) ou, sem arquivo, número e valor digitados.
 */
export function dadosEmissao(e: EntradaEmissao): { ok: true; dados: NotaEmissaoDados } | { ok: false; erro: string } {
  if (e.xml) {
    if (e.xml.tamanho > XML_MAX_BYTES) return { ok: false, erro: "O arquivo passa de 200 KB." };
    if (!/\.xml$/i.test(e.xml.nome)) return { ok: false, erro: "Envie o arquivo XML da nota (.xml)." };
    const lida = lerNfse(e.xml.texto);
    if ("erro" in lida) return { ok: false, erro: lida.erro };
    const dados: NotaEmissaoDados = {
      numero_nfse: lida.numero_nfse,
      valor: lida.valor,
      tomador_documento: lida.tomador_documento,
      competencia: lida.competencia,
    };
    if (lida.chave_acesso) dados.chave_acesso = lida.chave_acesso;
    if (lida.codigo_tributacao) dados.codigo_tributacao = lida.codigo_tributacao;
    return { ok: true, dados };
  }

  const numero = (e.numero ?? "").trim();
  if (!numero) return { ok: false, erro: "Informe o número da NFS-e." };
  if (numero.length > 60) return { ok: false, erro: "Número da NFS-e inválido." };
  const bruto = (e.valor ?? "").trim();
  if (!bruto) return { ok: false, erro: "Informe o valor da nota emitida." };
  const valor = reais(bruto);
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Valor da nota emitida inválido." };
  return { ok: true, dados: { numero_nfse: numero, valor: Math.round(valor * 100) / 100 } };
}
