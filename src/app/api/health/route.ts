import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check para monitor externo (UptimeRobot e afins). Sem login: o
 * proxy deixa passar tudo em /api/. Por isso o corpo só diz o estado; o
 * detalhe da falha vai para o log da Vercel.
 *
 * Banco respondendo a uma consulta mínima em `users` → 200 {status:"ok"}.
 * Qualquer outra coisa (erro, tabela ausente, demora) → 503 {status:"down"}.
 */

/** Monitor externo costuma desistir em 5 a 10 s. */
const TIMEOUT_MS = 2000;

async function checkDatabase(): Promise<boolean> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // O sinal cancela a consulta de verdade; a corrida com o timer é a garantia
  // caso algo ignore o sinal.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`passou de ${TIMEOUT_MS} ms`)), TIMEOUT_MS + 100);
  });
  try {
    // SEM `head: true`: com head o PostgREST responde 204 sem erro até para
    // tabela inexistente (ver `probeUsers` em auth/users.ts).
    const query = db.from("users").select("id").limit(1).abortSignal(signal);
    const { data, error } = await Promise.race([query, deadline]);
    if (error) throw new Error(error.message);
    if (data === null) throw new Error("resposta vazia do banco");
    return true;
  } catch (e) {
    console.error("health banco:", e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const ok = await checkDatabase();
  return Response.json(
    { status: ok ? "ok" : "down" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
