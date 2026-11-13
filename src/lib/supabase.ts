import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Cliente Supabase com a SERVICE ROLE KEY. Passa por cima do RLS.
 * Só pode ser usado em código de servidor (route handlers, server actions).
 * Nunca expor no navegador.
 */
export const db = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
