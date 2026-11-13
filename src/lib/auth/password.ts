import "server-only";
import crypto from "node:crypto";

/**
 * Hash de senha com scrypt (node:crypto), sem dependência externa.
 *
 * Por que scrypt e não bcrypt: bcrypt exigiria uma dependência a mais, e a
 * versão em JS puro é lenta o bastante para virar problema no serverless.
 * scrypt já vem no Node, é memory-hard (bcrypt não é) e roda no runtime que os
 * Server Actions usam. SHA-256 puro estaria fora de questão — é rápido demais,
 * que é exatamente o que não se quer aqui.
 *
 * Formato guardado: `scrypt$N$r$p$salt_b64$hash_b64`. Os parâmetros viajam
 * junto com o hash de propósito: quando forem endurecidos no futuro, os hashes
 * antigos continuam verificáveis com os parâmetros deles.
 */

const N = 32768; // custo de CPU/memória (2^15) → ~32 MB por verificação
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

// O default de maxmem no Node é 32 MB e 128*N*r dá exatamente 32 MB — ficaria
// no limite e lançaria. O dobro dá folga sem abrir mão do custo.
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Confere a senha contra o hash guardado. Devolve false para qualquer hash
 * malformado em vez de lançar — uma linha corrompida no banco não deve derrubar
 * a rota de login, só recusar a entrada.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    salt = Buffer.from(saltB64, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, n, r, p);
  } catch {
    return false;
  }

  // timingSafeEqual lança se os tamanhos diferem, e o próprio lançamento já
  // vazaria a informação pelo tempo. Compara o tamanho antes, fora do relógio.
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Queima o mesmo trabalho de uma verificação real, para quando o email não
 * existe. Sem isso, "email inexistente" responde em ~1ms e "senha errada" em
 * ~150ms, e a diferença entrega quais emails estão cadastrados.
 */
export async function fakeVerify(): Promise<void> {
  await scrypt("senha-que-nao-existe", Buffer.alloc(SALT_BYTES), N, R, P);
}

/** Senha aleatória legível, para o admin gerar uma nova para alguém. */
export function generatePassword(length = 16): string {
  // Sem I/l/1/O/0 — quem recebe vai digitar ou ditar isto.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    // `randomBytes[i] % 56` enviesaria as primeiras letras, porque 256 não é
    // múltiplo de 56. randomInt faz a rejeição por dentro e sai uniforme.
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

/** Regras mínimas de senha. Devolve a mensagem do problema, ou null se passa. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (password.length > 200) return "A senha é longa demais.";
  if (!/[a-zA-Z]/.test(password)) return "A senha precisa de pelo menos uma letra.";
  if (!/[0-9]/.test(password)) return "A senha precisa de pelo menos um número.";
  return null;
}
