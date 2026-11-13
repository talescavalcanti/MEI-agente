// Proatividade: o agendador abre tarefas de follow-up para propostas paradas
// (05-pendencias.sql) e pede ao agente um lembrete para cada uma. O lembrete
// é só um rascunho de mensagem ligado à tarefa: quem decide e envia é o
// usuário, no cartão. Nada sai sozinho.

import { moedaOu } from "@/lib/documentos/formato";
import type { FollowupGerado, Mei, Rpc } from "@/lib/dominio/tipos";
import { prefixarContexto } from "./contexto";
import { rodarTurno, type DepsTurno } from "./loop";

/** Teto de lembretes pedidos ao modelo por execução (controle de custo). */
export const MAX_SUGESTOES = 5;

/** Dias sem resposta para uma proposta contar como parada. */
export const DIAS_PARADA = 3;

/** Linha de `followups_sem_lembrete`. */
export type FollowupSemLembrete = {
  tarefa_id: string;
  servico_id: string;
  numero: number;
  descricao: string;
  valor: number | null;
  cliente_id: string;
  cliente_nome: string;
  dias_parado: number;
};

/** Linha de `propostas_paradas` (Início). */
export type PropostaParada = {
  servico_id: string;
  numero: number;
  descricao: string;
  valor: number | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  enviado_em: string;
  dias_parado: number;
  tarefa_id: string | null;
  /** O lembrete mais recente da tarefa aberta, se já foi redigido. */
  mensagem_id: string | null;
  mensagem_status: string | null;
};

/** Número do serviço como aparece nas telas: `#009`. */
export const numeroServico = (n: number) => `#${String(n).padStart(3, "0")}`;

/**
 * O pedido ao agente para uma proposta parada. Leva os ids que o
 * `redigir_mensagem` precisa, para o modelo não ter de procurar nada.
 */
export function textoFollowup(f: FollowupSemLembrete): string {
  const dias = f.dias_parado === 1 ? "1 dia" : `${f.dias_parado} dias`;
  return (
    `Proposta parada: serviço ${numeroServico(f.numero)} (${f.cliente_nome}, ${f.descricao}, ${moedaOu(f.valor)}) ` +
    `sem resposta há ${dias}. Redija um lembrete curto e cordial com redigir_mensagem ` +
    `(objetivo lembrete, cliente_id ${f.cliente_id}, servico_id ${f.servico_id}, tarefa_id ${f.tarefa_id}).`
  );
}

async function semLembrete(rpc: Rpc, meiId: string, limite: number): Promise<FollowupSemLembrete[]> {
  return ((await rpc("followups_sem_lembrete", { p_mei: meiId, p_limite: limite })) ?? []) as FollowupSemLembrete[];
}

/**
 * Para cada tarefa aberta do MEI sem lembrete (até `limite`), roda um turno
 * do agente com `origem: "agendador"` pedindo o lembrete. Cada pedido vira
 * uma conversa própria, com o contexto do negócio na frente.
 *
 * `sugeridas`: tarefas que ganharam lembrete nesta execução. `tentativas`:
 * turnos rodados (o que gasta o teto, deu certo ou não). Nunca lança por
 * falha do modelo: o turno vira erro na conversa e a tarefa fica para a
 * próxima execução.
 */
export async function sugerirFollowups(
  deps: DepsTurno,
  meiId: string,
  limite: number = MAX_SUGESTOES,
): Promise<{ sugeridas: number; tentativas: number }> {
  if (limite <= 0) return { sugeridas: 0, tentativas: 0 };
  const d: DepsTurno = { ...deps, meiId };

  const fila = await semLembrete(d.rpc, meiId, limite);
  if (!fila.length) return { sugeridas: 0, tentativas: 0 };

  const mei = (await d.rpc("mei_por_id", { p_mei: meiId })) as Mei | null;
  if (!mei?.id) return { sugeridas: 0, tentativas: 0 };

  for (const f of fila) {
    const texto = await prefixarContexto(d.rpc, mei, d.hoje, textoFollowup(f));
    await rodarTurno(d, { conversaId: null, texto, origem: "agendador" }, () => {});
  }

  // Conta pelo banco, não pelo que o modelo disse: só vale lembrete gravado
  // com a tarefa ligada.
  const restantes = new Set((await semLembrete(d.rpc, meiId, 1000)).map((f) => f.tarefa_id));
  const sugeridas = fila.filter((f) => !restantes.has(f.tarefa_id)).length;
  return { sugeridas, tentativas: fila.length };
}

export type ResultadoAgendador = { tarefasNovas: number; sugeridas: number; meis: number };

/**
 * Uma execução do agendador: abre as tarefas de follow-up e pede os
 * lembretes, até `limite` turnos no total. Sem `meiId`, de todos os MEIs
 * (cron); com `meiId`, só daquele ("Verificar agora").
 *
 * Falha num MEI fica no log e não para os outros.
 */
export async function rodarAgendador(
  rpc: Rpc,
  depsDe: (meiId: string) => DepsTurno,
  opcoes: { meiId?: string; limite?: number } = {},
): Promise<ResultadoAgendador> {
  const novas = ((await rpc("tarefas_gerar_followups", {
    p_dias: DIAS_PARADA,
    p_mei: opcoes.meiId,
  })) ?? []) as FollowupGerado[];

  const meis = opcoes.meiId
    ? [opcoes.meiId]
    : (((await rpc("followups_meis_pendentes")) ?? []) as string[]);

  let restante = opcoes.limite ?? MAX_SUGESTOES;
  let sugeridas = 0;
  let atendidos = 0;
  for (const meiId of meis) {
    if (restante <= 0) break;
    try {
      const r = await sugerirFollowups(depsDe(meiId), meiId, restante);
      restante -= r.tentativas;
      sugeridas += r.sugeridas;
      if (r.tentativas) atendidos++;
    } catch (e) {
      console.error(`[agendador] MEI ${meiId}:`, e);
    }
  }

  return { tarefasNovas: novas.length, sugeridas, meis: atendidos };
}
