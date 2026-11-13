import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  type SessionPayload,
} from "./session";

/**
 * Leitura e escrita do cookie de sessão. Separado de `session.ts` porque
 * `next/headers` só existe dentro de uma requisição de render — o proxy, que
 * roda antes disso, importa só a parte criptográfica.
 */

export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    // JS do navegador não lê o cookie — corta o roubo de sessão por XSS.
    httpOnly: true,
    // Em produção só viaja por https. Em dev o localhost é http e a flag
    // impediria o login de funcionar na sua máquina.
    secure: process.env.NODE_ENV === "production",
    // Não acompanha requisição vinda de outro site: é a defesa de CSRF das
    // Server Actions. `lax` (e não `strict`) para quem chega por um link de
    // outro site (um favorito, um email) já entrar logado.
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}
