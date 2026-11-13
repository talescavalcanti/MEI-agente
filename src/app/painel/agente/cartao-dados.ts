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
  Orcamento,
  OrcamentoItem,
} from "@/lib/dominio/tipos";

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
