import "server-only";
import { meiDoUsuario, rpcDb } from "@/lib/dominio/mei";
import type { Mei, Rpc } from "@/lib/dominio/tipos";
import { env } from "@/lib/env";
import { ymdSP } from "@/lib/tz";
import { blocoContexto } from "./contexto";
import { criarLlm } from "./llm";
import type { DepsTurno } from "./loop";
import { montarSystem } from "./prompt";

// Peças de servidor do agente: montam as dependências de um turno (banco,
// modelo, "hoje" em São Paulo, system e limite diário) e o texto do usuário
// com o contexto do negócio. Usado pela rota de chat e pelo agendador.

/**
 * Dependências de um turno para o MEI. `hoje` é a data de agora em
 * America/Sao_Paulo; o modelo é o da Featherless (`AGENTE_MODELO`).
 */
export function depsDoMei(meiId: string, opcoes: { rpc?: Rpc; agora?: Date } = {}): DepsTurno {
  return {
    rpc: opcoes.rpc ?? rpcDb,
    llm: criarLlm(),
    meiId,
    hoje: ymdSP(opcoes.agora ?? new Date()),
    system: montarSystem(),
    limiteDiario: env.limiteDiarioTokens,
  };
}

/**
 * Prepara o turno de um usuário do painel: o MEI dele e as dependências.
 * `null` quando o usuário ainda não cadastrou o negócio.
 */
export async function prepararTurno(userId: string): Promise<{ deps: DepsTurno; mei: Mei } | null> {
  const mei = await meiDoUsuario(rpcDb, userId);
  if (!mei) return null;
  return { deps: depsDoMei(mei.id), mei };
}

/**
 * O texto do usuário com o bloco `<contexto_do_negocio>` na frente (dados do
 * MEI, hoje e memórias). O system fica constante; o que muda vai aqui.
 */
export async function textoComContexto(deps: DepsTurno, mei: Mei, texto: string): Promise<string> {
  const memorias = (await deps.rpc("memoria_listar", { p_mei: mei.id })) as { fato: string }[] | null;
  const fatos = (memorias ?? []).map((m) => m.fato);
  return `${blocoContexto(mei, fatos, deps.hoje)}\n\n${texto}`;
}
