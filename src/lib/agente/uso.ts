// Uso de tokens do agente por MEI e dia (America/Sao_Paulo), sobre as funções
// de `supabase/06-agente.sql`. Serve para o limite diário (README §9).

import type { Rpc } from "@/lib/dominio/tipos";

export type Uso = { entrada: number; saida: number };

/** Tokens usados hoje (entrada + saída). */
export async function usoHoje(rpc: Rpc, meiId: string): Promise<number> {
  return Number((await rpc("uso_hoje", { p_mei: meiId })) ?? 0);
}

/** Soma o uso de uma volta do modelo ao dia de hoje. */
export async function somarUso(rpc: Rpc, meiId: string, uso: Uso): Promise<void> {
  const entrada = inteiro(uso.entrada);
  const saida = inteiro(uso.saida);
  if (!entrada && !saida) return;
  await rpc("uso_somar", { p_mei: meiId, p_entrada: entrada, p_saida: saida });
}

/** `true` quando o uso de hoje já chegou ao limite diário. */
export async function limiteAtingido(rpc: Rpc, meiId: string, limiteDiario: number): Promise<boolean> {
  return (await usoHoje(rpc, meiId)) >= limiteDiario;
}

function inteiro(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
