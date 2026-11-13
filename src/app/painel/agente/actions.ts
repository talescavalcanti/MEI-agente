"use server";

import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { ItemDecisaoPedido, ItemTipo, ItemVisto } from "@/lib/dominio/tipos";
import {
  ERRO_NAO_ENCONTRADO,
  decisaoValida,
  erroDeAcao,
  idValido,
  montarCartao,
  tipoValido,
  validarEdicao,
  type ResultadoCartao,
} from "./cartao-dados";

// Ações dos cartões de aprovação. Server Action é endpoint público: o MEI vem
// sempre da sessão (`requireMei`), a entrada é validada antes de ir ao banco e
// a resposta é o cartão montado, nunca a linha crua. Erro `regra:` volta como
// `{ erro }` com a frase; sem sessão, `requireMei` redireciona (não é pego).
//
// Toda ação relê o item com `item_ver` e devolve o estado atual: clique duplo
// ou decisão repetida só devolve o mesmo cartão (o SQL não muda nada).

async function cartao(meiId: string, tipo: ItemTipo, id: string): Promise<ResultadoCartao> {
  const visto = (await rpcDb("item_ver", { p_mei: meiId, p_tipo: tipo, p_id: id })) as ItemVisto;
  return { cartao: montarCartao(tipo, visto) };
}

/** Estado atual do item, para desenhar o cartão (também ao recarregar a conversa). */
export async function verItem(tipo: ItemTipo, id: string): Promise<ResultadoCartao> {
  const { mei } = await requireMei();
  if (!tipoValido(tipo) || !idValido(id)) return { erro: ERRO_NAO_ENCONTRADO };
  try {
    return await cartao(mei.id, tipo, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/** Aprovar ou descartar um rascunho. Só age em `rascunho`. */
export async function decidirItem(
  tipo: ItemTipo,
  id: string,
  decisao: ItemDecisaoPedido,
): Promise<ResultadoCartao> {
  const { user, mei } = await requireMei();
  if (!tipoValido(tipo) || !idValido(id)) return { erro: ERRO_NAO_ENCONTRADO };
  if (!decisaoValida(decisao)) return { erro: "Decisão inválida." };
  try {
    await rpcDb("item_decidir", { p_mei: mei.id, p_tipo: tipo, p_id: id, p_decisao: decisao, p_user: user.id });
    return await cartao(mei.id, tipo, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/** Editar um rascunho: mensagem `{conteudo}`, contrato `{minuta}`, orçamento `{itens?, validade_dias?}`. */
export async function editarItem(tipo: ItemTipo, id: string, dados: unknown): Promise<ResultadoCartao> {
  const { mei } = await requireMei();
  if (!tipoValido(tipo) || !idValido(id)) return { erro: ERRO_NAO_ENCONTRADO };
  const v = validarEdicao(tipo, dados);
  if (!v.ok) return { erro: v.erro };
  try {
    await rpcDb("item_editar", { p_mei: mei.id, p_tipo: tipo, p_id: id, p_dados: v.dados });
    return await cartao(mei.id, tipo, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/** A pessoa enviou a mensagem aprovada por fora (copiou ou abriu o WhatsApp). */
export async function marcarEnviada(id: string): Promise<ResultadoCartao> {
  const { mei } = await requireMei();
  if (!idValido(id)) return { erro: ERRO_NAO_ENCONTRADO };
  try {
    await rpcDb("mensagem_marcar_enviada", { p_mei: mei.id, p_id: id });
    return await cartao(mei.id, "mensagem", id);
  } catch (e) {
    return erroDeAcao(e);
  }
}
