// Histórico das conversas do agente e trilha de auditoria, sobre as funções
// de `supabase/06-agente.sql`. O histórico é append-only: a mensagem do
// modelo é gravada inteira em `content` e volta igual em `historico`.

import type { ModelMessage } from "ai";
import type { Rpc } from "@/lib/dominio/tipos";
import type { Cartao } from "./ferramentas/definicoes";

export type ConversaOrigem = "chat" | "agendador";

/** Linha de `conversas`. */
export type Conversa = {
  id: string;
  mei_id: string;
  titulo: string;
  origem: ConversaOrigem;
  /** Data e hora em texto ISO. */
  criado_em: string;
};

/** Linha de `conversa_mensagens`, na ordem de `id`. */
export type ConversaMensagem = {
  id: number;
  conversa_id: string;
  role: ModelMessage["role"];
  /** A mensagem do modelo inteira, como foi gravada. */
  content: ModelMessage;
  /** Itens criados no turno (orçamento, contrato, mensagem), para os cartões. */
  cartoes: Cartao[] | null;
  criado_em: string;
};

/** Mensagem a gravar: a `ModelMessage` e, se houver, os cartões dela. */
export type NovaMensagem = { mensagem: ModelMessage; cartoes?: Cartao[] | null };

export type AcaoTipo = "ferramenta" | "decisao";

/** Título da conversa a partir do 1º texto do usuário. */
export function tituloDe(texto: string): string {
  const linha = texto.trim().split("\n")[0].replace(/\s+/g, " ").trim();
  if (!linha) return "Nova conversa";
  return linha.length > 60 ? `${linha.slice(0, 59)}…` : linha;
}

export async function criarConversa(
  rpc: Rpc,
  meiId: string,
  opcoes: { origem?: ConversaOrigem; titulo: string },
): Promise<Conversa> {
  return (await rpc("conversa_criar", {
    p_mei: meiId,
    p_origem: opcoes.origem ?? "chat",
    p_titulo: opcoes.titulo,
  })) as Conversa;
}

/**
 * Grava as mensagens na ordem, todas na mesma transação (ou nenhuma). É assim
 * que a mensagem do assistente com chamadas de ferramenta e a mensagem com os
 * resultados entram juntas: o histórico nunca fica com chamada sem resultado.
 */
export async function anexarMensagens(
  rpc: Rpc,
  meiId: string,
  conversaId: string,
  mensagens: NovaMensagem[],
): Promise<void> {
  if (!mensagens.length) return;
  await rpc("conversa_anexar_varias", {
    p_mei: meiId,
    p_conversa: conversaId,
    p_mensagens: mensagens.map((m) => ({
      role: m.mensagem.role,
      content: m.mensagem,
      cartoes: m.cartoes?.length ? m.cartoes : null,
    })),
  });
}

export async function lerConversa(rpc: Rpc, meiId: string, conversaId: string): Promise<ConversaMensagem[]> {
  return (await rpc("conversa_ler", { p_mei: meiId, p_conversa: conversaId })) as ConversaMensagem[];
}

/** As mensagens do modelo, na ordem, sem nenhuma alteração. */
export function historico(linhas: ConversaMensagem[]): ModelMessage[] {
  return linhas.map((l) => l.content);
}

/** Conversas do MEI, a de mensagem mais recente primeiro (máx. 50). */
export async function listarConversas(rpc: Rpc, meiId: string): Promise<Conversa[]> {
  return (await rpc("conversa_listar", { p_mei: meiId })) as Conversa[];
}

/** Registra uma ação na trilha de auditoria (`agente_acoes`). */
export async function registrarAcao(
  rpc: Rpc,
  meiId: string,
  acao: {
    conversaId: string | null;
    tipo: AcaoTipo;
    nome: string;
    entrada: unknown;
    saida: unknown;
    erro: boolean;
    userId?: string | null;
  },
): Promise<void> {
  await rpc("acao_registrar", {
    p_mei: meiId,
    p_conversa: acao.conversaId,
    p_tipo: acao.tipo,
    p_nome: acao.nome,
    p_entrada: acao.entrada ?? null,
    p_saida: acao.saida ?? null,
    p_erro: acao.erro,
    p_user: acao.userId ?? null,
  });
}
