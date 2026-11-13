import { SignJWT, jwtVerify } from "jose";

/**
 * Sessão sem estado: um JWT HS256 dentro de um cookie httpOnly.
 *
 * Este arquivo é só a criptografia — assinar e conferir. Nada de `next/headers`
 * aqui de propósito: o `src/proxy.ts` importa `verifySession`, e o proxy roda
 * antes de existir o contexto de requisição que `cookies()` precisa. Ler e
 * escrever o cookie mora em `cookie.ts`, que só código de render usa.
 *
 * O payload carrega o mínimo — id, papel e a versão do token. Nada de email,
 * nome ou qualquer coisa que mude: o JWT não é a fonte da verdade, é só uma
 * prova de que o servidor emitiu aquilo. Quem quer saber o papel *atual* de
 * alguém lê o banco (ver dal.ts) — senão um usuário rebaixado de admin para
 * normal continuaria admin até o token expirar.
 */

export const SESSION_COOKIE = "mei_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

export type Role = "admin" | "user";

export type SessionPayload = {
  sub: string; // id do usuário
  role: Role;
  ver: number; // token_version de quando foi emitido
};

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Variável de ambiente ausente: SESSION_SECRET");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, ver: payload.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/**
 * Devolve o payload, ou null para qualquer token inválido/expirado/adulterado.
 *
 * `algorithms: ["HS256"]` não é decoração: sem essa trava, um atacante troca o
 * header para `alg: none` (ou para um algoritmo assimétrico usando a chave
 * pública como segredo HMAC) e forja sessão. É a confusão de algoritmo, o
 * clássico do JWT.
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const sub = payload.sub;
    const role = payload.role;
    const ver = payload.ver;
    if (typeof sub !== "string" || (role !== "admin" && role !== "user") || typeof ver !== "number") {
      return null;
    }
    return { sub, role, ver };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
