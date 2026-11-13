import "server-only";
import { db } from "@/lib/supabase";
import { normalizeEmail } from "./users";

/**
 * Limite de tentativas de login (tabela e funções em supabase/01-auth.sql).
 *
 * Duas chaves, cada uma com o seu teto numa janela deslizante de 15 min:
 *
 * - email: 10 falhas. Quem erra a própria senha raramente passa de 3 ou 4
 *   seguidas; 10 deixa folga para o gerenciador de senhas trocado, o caps
 *   lock e o celular. Para quem ataca, dá no máximo 40 palpites por hora
 *   (~1.000 por dia) numa conta — nada perto do necessário contra uma senha
 *   de 8+ caracteres com letra e número. E o custo do outro lado é pequeno:
 *   se alguém esgotar o limite de propósito, o dono espera no máximo 15 min.
 * - ip (x-forwarded-for): 30 falhas. Pega quem tenta muitos emails de uma
 *   máquina só. Mais alto porque operadora de celular põe muita gente atrás
 *   do mesmo IP (CGNAT) — um teto baixo aqui travaria quem não fez nada.
 *
 * FAIL-OPEN, de propósito: tabela ausente ou banco com erro → loga e deixa
 * tentar, como era antes. Assim o deploy pode ir antes do SQL sem derrubar o
 * login, e um problema no limitador nunca tranca o dono do painel do lado de
 * fora. O limitador é camada extra; a senha continua sendo a porta.
 *
 * Tentativa barrada não conta como falha: senão quem insiste ficaria preso
 * para sempre. Com a janela deslizante, a cada falha que envelhece abre uma
 * vaga nova.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_BY_EMAIL = 10;
const MAX_BY_IP = 30;

type Key = { key: string; max: number };

export function loginKeys(email: string, ip: string | null): Key[] {
  const keys: Key[] = [{ key: `email:${normalizeEmail(email)}`, max: MAX_BY_EMAIL }];
  if (ip) keys.push({ key: `ip:${ip}`, max: MAX_BY_IP });
  return keys;
}

/**
 * IP de quem chamou. Na Vercel o primeiro valor do x-forwarded-for é o do
 * cliente (a plataforma sobrescreve o que vier de fora). Sem o header, a
 * chave de IP simplesmente não entra.
 */
export function clientIp(forwardedFor: string | null): string | null {
  const ip = forwardedFor?.split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}

/** Alguma das chaves já bateu no teto? Em erro, false (fail-open). */
export async function loginBlocked(keys: Key[]): Promise<boolean> {
  const counts = await Promise.all(
    keys.map(async ({ key, max }) => {
      const { data, error } = await db.rpc("login_failures", {
        p_key: key,
        p_window_seconds: WINDOW_SECONDS,
      });
      if (error || typeof data !== "number") {
        console.error(`loginBlocked ${key.split(":")[0]}:`, error?.message ?? "resposta inesperada");
        return false;
      }
      return data >= max;
    })
  );
  return counts.some(Boolean);
}

/** Registra uma falha em cada chave. Nunca lança (fail-open). */
export async function registerLoginFailure(keys: Key[]): Promise<void> {
  await Promise.all(
    keys.map(async ({ key, max }) => {
      const { error } = await db.rpc("login_register_failure", {
        p_key: key,
        p_window_seconds: WINDOW_SECONDS,
        p_keep: max,
      });
      if (error) console.error(`registerLoginFailure ${key.split(":")[0]}:`, error.message);
    })
  );
}

/**
 * Login certo zera as falhas do email — quem errou 9 vezes e acertou não
 * começa a próxima sessão a um erro do bloqueio. A chave de IP fica: um
 * acerto numa conta não absolve as tentativas contra as outras.
 */
export async function clearLoginFailures(email: string): Promise<void> {
  const { error } = await db
    .from("login_attempts")
    .delete()
    .eq("key", `email:${normalizeEmail(email)}`);
  if (error) console.error("clearLoginFailures:", error.message);
}
