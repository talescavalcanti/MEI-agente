import { createHash, timingSafeEqual } from "node:crypto";
import { rodarAgendador } from "@/lib/agente/pendencias";
import { depsDoMei } from "@/lib/agente/servidor";
import { rpcDb } from "@/lib/dominio/mei";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Até 5 turnos do agente em sequência. */
export const maxDuration = 300;

/**
 * Agendador de pendências, chamado pelo pg_cron (supabase/90-cron.sql) uma
 * vez por dia. Abre as tarefas de follow-up das propostas paradas e pede ao
 * agente um lembrete (rascunho) para cada uma, até 5 por execução.
 *
 * Sem sessão: autenticado por `Authorization: Bearer <CRON_SECRET>`. GET e
 * POST fazem o mesmo (o pg_net manda POST; o cron da Vercel manda GET).
 */

const SEM_CACHE = { "Cache-Control": "no-store" } as const;

/** Compara pelo hash: tempo constante e sem vazar o tamanho do segredo. */
function autorizado(req: Request): boolean {
  const cabecalho = req.headers.get("authorization") ?? "";
  if (!cabecalho.startsWith("Bearer ")) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(cabecalho.slice("Bearer ".length)), hash(env.cronSecret));
}

async function executar(req: Request): Promise<Response> {
  if (!autorizado(req)) {
    return Response.json({ error: "Não autorizado." }, { status: 401, headers: SEM_CACHE });
  }
  try {
    const r = await rodarAgendador(rpcDb, (meiId) => depsDoMei(meiId));
    return Response.json({ ok: true, ...r }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[cron pendencias]", e);
    return Response.json({ ok: false, error: "Falha ao verificar pendências." }, { status: 500, headers: SEM_CACHE });
  }
}

export async function GET(req: Request): Promise<Response> {
  return executar(req);
}

export async function POST(req: Request): Promise<Response> {
  return executar(req);
}
