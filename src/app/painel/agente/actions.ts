"use server";

import { revalidatePath } from "next/cache";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { ItemDecisaoPedido, ItemTipo, ItemVisto, NotaFiscal, NotaVista } from "@/lib/dominio/tipos";
import {
  ERRO_NAO_ENCONTRADO,
  ERRO_NOTA_NAO_ENCONTRADA,
  XML_MAX_BYTES,
  dadosEmissao,
  decisaoValida,
  erroDeAcao,
  idValido,
  montarCartao,
  montarCartaoNota,
  tipoValido,
  validarEdicao,
  type EntradaEmissao,
  type ResultadoCartao,
  type ResultadoNota,
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

// ---------------------------------------------------------------- nota fiscal

async function cartaoNota(meiId: string, id: string): Promise<ResultadoNota> {
  const v = (await rpcDb("nota_ver", { p_mei: meiId, p_id: id })) as NotaVista;
  return { cartao: montarCartaoNota(v.nota, { clienteNome: v.cliente?.nome ?? null, municipioMei: v.mei.municipio }) };
}

/** Estado atual da nota, para desenhar o cartão. */
export async function verNota(id: string): Promise<ResultadoNota> {
  const { mei } = await requireMei();
  if (!idValido(id)) return { erro: ERRO_NOTA_NAO_ENCONTRADA };
  try {
    return await cartaoNota(mei.id, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/** Prepara (ou refaz) o rascunho da nota de um serviço, pela tela Notas a emitir. */
export async function prepararNota(servicoId: string): Promise<ResultadoNota> {
  const { mei } = await requireMei();
  if (!idValido(servicoId)) return { erro: "Serviço não encontrado." };
  try {
    const nota = (await rpcDb("nota_preparar", { p_mei: mei.id, p_servico: servicoId })) as NotaFiscal;
    revalidatePath("/painel/notas");
    return await cartaoNota(mei.id, nota.id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/**
 * Aprovar ou descartar o rascunho da nota. Com avisos, aprovar exige
 * `avisosConfirmados` (o SQL recusa sem). Repetir não muda nada.
 */
export async function decidirNota(
  id: string,
  decisao: ItemDecisaoPedido,
  avisosConfirmados: boolean,
): Promise<ResultadoNota> {
  const { user, mei } = await requireMei();
  if (!idValido(id)) return { erro: ERRO_NOTA_NAO_ENCONTRADA };
  if (!decisaoValida(decisao)) return { erro: "Decisão inválida." };
  try {
    await rpcDb("nota_decidir", {
      p_mei: mei.id,
      p_id: id,
      p_decisao: decisao,
      p_user: user.id,
      p_avisos_confirmados: avisosConfirmados === true,
    });
    revalidatePath("/painel/notas");
    return await cartaoNota(mei.id, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

/**
 * Registra a nota emitida no Emissor Nacional: arquivo `xml` (até 200 KB,
 * lido aqui no servidor com `lerNfse`; só os campos extraídos vão ao SQL) ou
 * `numero` e `valor` digitados. O SQL confere contra o rascunho.
 */
export async function registrarEmissao(id: string, formData: FormData): Promise<ResultadoNota> {
  const { mei } = await requireMei();
  if (!idValido(id)) return { erro: ERRO_NOTA_NAO_ENCONTRADA };

  const arquivo = formData.get("xml");
  let entrada: EntradaEmissao;
  if (arquivo instanceof File && arquivo.size > 0) {
    // O tamanho é conferido antes de ler o conteúdo.
    if (arquivo.size > XML_MAX_BYTES) return { erro: "O arquivo passa de 200 KB." };
    entrada = { xml: { nome: arquivo.name, tamanho: arquivo.size, texto: await arquivo.text() } };
  } else {
    entrada = { numero: texto(formData.get("numero")), valor: texto(formData.get("valor")) };
  }
  const d = dadosEmissao(entrada);
  if (!d.ok) return { erro: d.erro };

  try {
    await rpcDb("nota_registrar_emissao", { p_mei: mei.id, p_id: id, p_dados: d.dados });
    revalidatePath("/painel/notas");
    return await cartaoNota(mei.id, id);
  } catch (e) {
    return erroDeAcao(e);
  }
}

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" ? v : null;
}
