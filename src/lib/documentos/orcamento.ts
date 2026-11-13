// Orçamento renderizado por template a partir do banco: valores e datas nunca
// vêm do texto do modelo.
import { A_PREENCHER, moedaOu, numero, texto } from "./formato";
import type { DadosDocumento } from "./tipos";

export type OrcamentoRenderizado = {
  titulo: string;
  linhas: { descricao: string; valor: string }[];
  total: string;
  validade: string;
  pagamento: string;
};

export function renderOrcamento(d: DadosDocumento): OrcamentoRenderizado {
  const descricao = texto(d.servico.descricao) ?? A_PREENCHER;
  const orc = d.orcamento ?? null;
  const itens = orc?.itens ?? [];

  const numOrc = numero(orc?.numero);
  const numServ = numero(d.servico.numero);
  const titulo =
    numOrc !== null
      ? `Orçamento nº ${numOrc}: ${descricao}`
      : numServ !== null
        ? `Orçamento do serviço nº ${numServ}: ${descricao}`
        : `Orçamento: ${descricao}`;

  const total = moedaOu(valorTotal(d));
  const linhas = itens.length
    ? itens.map((i) => ({ descricao: texto(i.descricao) ?? A_PREENCHER, valor: moedaOu(i.valor) }))
    : [{ descricao, valor: total }];

  const dias = numero(orc?.validade_dias);
  const validade = dias === null ? A_PREENCHER : `Válido por ${dias} ${dias === 1 ? "dia" : "dias"}`;

  return { titulo, linhas, total, validade, pagamento: formaPagamento(d) ?? A_PREENCHER };
}

/** Valor do documento: o do orçamento, a soma dos itens ou o do serviço. */
export function valorTotal(d: DadosDocumento): number | null {
  const orc = d.orcamento ?? null;
  const doOrcamento = numero(orc?.valor);
  if (doOrcamento !== null) return doOrcamento;
  const itens = orc?.itens ?? [];
  if (itens.length && itens.every((i) => numero(i.valor) !== null)) {
    return itens.reduce((s, i) => s + i.valor, 0);
  }
  return numero(d.servico.valor);
}

/** `"Pix (chave: x)"` quando é Pix e há chave; senão a forma como veio; `null` sem forma. */
function formaPagamento(d: DadosDocumento): string | null {
  const forma = texto(d.servico.forma_pagamento);
  if (forma === null) return null;
  const chave = texto(d.mei.chave_pix);
  return chave && /\bpix\b/i.test(forma) ? `${forma} (chave: ${chave})` : forma;
}
