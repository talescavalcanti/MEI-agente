"use server";

import { refresh } from "next/cache";
import { rodarAgendador } from "@/lib/agente/pendencias";
import { depsDoMei } from "@/lib/agente/servidor";
import { mensagemDeRegra, requireMei, rpcDb } from "@/lib/dominio/mei";

// Ações do Início. Server Action é endpoint público: o MEI vem sempre da
// sessão (`requireMei`), nunca do cliente.

export type ResultadoVerificacao = { ok: true; tarefasNovas: number; sugeridas: number } | { erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Verificar agora": o mesmo que o agendador faz de manhã, só para o MEI de
 * quem clicou. Abre as tarefas das propostas paradas e pede os lembretes.
 */
export async function verificarPendenciasAgora(): Promise<ResultadoVerificacao> {
  const { mei } = await requireMei();
  try {
    const r = await rodarAgendador(rpcDb, (meiId) => depsDoMei(meiId), { meiId: mei.id });
    refresh();
    return { ok: true, tarefasNovas: r.tarefasNovas, sugeridas: r.sugeridas };
  } catch (e) {
    console.error("[inicio] verificar pendências:", e);
    return { erro: "Não deu para verificar agora. Tente de novo em instantes." };
  }
}

/** "Ignorar": fecha a tarefa da proposta parada sem lembrar o cliente. */
export async function ignorarPendencia(tarefaId: string): Promise<{ ok: true } | { erro: string }> {
  const { mei } = await requireMei();
  if (typeof tarefaId !== "string" || !UUID.test(tarefaId)) return { erro: "Pendência não encontrada." };
  try {
    await rpcDb("tarefa_fechar", { p_mei: mei.id, p_id: tarefaId, p_status: "ignorada" });
    refresh();
    return { ok: true };
  } catch (e) {
    const regra = mensagemDeRegra(e);
    if (regra) return { erro: regra };
    console.error("[inicio] ignorar pendência:", e);
    return { erro: "Não deu para ignorar agora. Tente de novo." };
  }
}
