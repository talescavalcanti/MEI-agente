import "server-only";
import { db } from "@/lib/supabase";
import type { Role } from "./session";

/**
 * Consultas da tabela `users`.
 *
 * Nenhuma função aqui devolve `password_hash`. As colunas são listadas uma a
 * uma em vez de `select("*")` justamente por isso: com `*`, no dia em que
 * alguém passar a linha inteira para um componente de cliente, o hash vai
 * junto. Listar as colunas faz o vazamento precisar ser escrito de propósito.
 */

const PUBLIC_COLUMNS = "id,email,name,role,created_at,updated_at,last_login_at";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

/** Normaliza email para busca e gravação: o índice único é em lower(email). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * "Já existe algum usuário?" — a pergunta que decide se o /setup abre.
 *
 * NÃO usa `{ count: 'exact', head: true }`. Com `head`, o supabase-js manda um
 * HEAD e o PostgREST responde **204 sem corpo e sem erro** mesmo quando a tabela
 * não existe: chega `error: null, count: null`. O canal de erro fica mudo. A
 * mesma consulta sem `head` devolve o PGRST205 direitinho — então é essa que
 * vale aqui. (Verificado contra este projeto: HEAD → 204/null; GET → 404/PGRST205.)
 *
 * Isso é o que tornava `count ?? 0` uma falha de segurança e não um descuido:
 * banco fora do ar viraria "zero usuários", e o /setup — que cria um
 * administrador — reabriria numa instalação já em produção.
 *
 * Devolve um resultado explícito em vez de lançar, para a tela conseguir
 * distinguir "falta rodar o SQL" de "o banco caiu". Quem decide qualquer coisa a
 * partir disto só pode agir no caso `ok: true`.
 */
export type UsersProbe =
  | { ok: true; empty: boolean }
  | { ok: false; reason: "missing_table" | "unavailable"; message: string };

export async function probeUsers(): Promise<UsersProbe> {
  const { data, error } = await db.from("users").select("id").limit(1);

  if (error) {
    // PGRST205 = tabela ausente do schema cache do PostgREST. Também aparece
    // nos primeiros segundos depois de criar a tabela, antes do cache recarregar.
    const missing = error.code === "PGRST205" || error.code === "42P01";
    return {
      ok: false,
      reason: missing ? "missing_table" : "unavailable",
      message: error.message,
    };
  }
  if (data === null) {
    return { ok: false, reason: "unavailable", message: "Resposta vazia do banco." };
  }
  return { ok: true, empty: data.length === 0 };
}

// Lança em erro: lista vazia por falha de banco pareceria "ninguém cadastrado".
// Quem chama decide — a página de usuários cai no error.tsx.
export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await db
    .from("users")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao ler usuários: ${error.message}`);
  return (data ?? []) as AppUser[];
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const { data } = await db.from("users").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  return (data as AppUser) ?? null;
}

/** Só o login usa isto — é a única função que traz o hash. */
export async function findForLogin(
  email: string,
): Promise<{ id: string; role: Role; token_version: number; password_hash: string } | null> {
  // `eq`, nunca `ilike`: em ilike o `%` e o `_` do argumento são curingas, então
  // um email com `%` viraria uma busca ampla que casa com outra conta. Como toda
  // escrita passa por normalizeEmail, o que está guardado já é minúsculo e a
  // comparação exata basta.
  const { data } = await db
    .from("users")
    .select("id,role,token_version,password_hash")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  return data ?? null;
}

// Lança em erro: "não sei" não pode virar "email livre".
export async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  let q = db.from("users").select("id").eq("email", normalizeEmail(email));
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`Falha ao conferir email: ${error.message}`);
  return !!data;
}

/**
 * Quantos admins existem (fora `exceptId`). Decide se dá para rebaixar ou
 * apagar alguém — por isso lança em erro (fail-closed) em vez de devolver 0.
 *
 * Sem `head: true`, pelo mesmo motivo de `probeUsers`: com head, banco fora do
 * ar chega como `count: null` sem erro. O antigo `count ?? 0` só acertava por
 * sorte — os chamadores comparam com 0, então o "zero" falso barrava a ação
 * com "é o único administrador", uma mentira. Um erro explícito não depende de
 * para qual lado o número falso favorece. `limit(1)` mantém a resposta
 * pequena; o `count` continua sendo o total.
 */
export async function countAdmins(exceptId?: string): Promise<number> {
  let q = db.from("users").select("id", { count: "exact" }).eq("role", "admin");
  if (exceptId) q = q.neq("id", exceptId);
  const { count, error } = await q.limit(1);
  if (error || count === null) {
    throw new Error(`Falha ao contar administradores: ${error?.message ?? "contagem vazia"}`);
  }
  return count;
}

export async function insertUser(row: {
  email: string;
  name: string;
  password_hash: string;
  role: Role;
}): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("users")
    .insert({ ...row, email: normalizeEmail(row.email) })
    .select("id")
    .single();

  // O índice único em lower(email) é a última linha de defesa contra duas
  // contas com o mesmo email — `emailTaken` checa antes, mas duas requisições
  // simultâneas passam pela checagem juntas. Traduz a violação do índice em
  // algo legível em vez de deixar subir "duplicate key value violates...".
  if (error) {
    if (error.code === "23505") throw new Error("Já existe um usuário com esse email.");
    throw new Error(error.message);
  }
  return data ?? null;
}

export async function updateUser(
  id: string,
  patch: Partial<{
    email: string;
    name: string;
    role: Role;
    password_hash: string;
  }>,
  opts: { bumpTokenVersion?: boolean } = {},
): Promise<void> {
  const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.email) row.email = normalizeEmail(patch.email);

  // Trocar a senha precisa derrubar as sessões abertas com a senha antiga.
  // O incremento é lido do banco na hora para não perder corridas com outra
  // troca simultânea.
  if (opts.bumpTokenVersion) {
    const { data } = await db.from("users").select("token_version").eq("id", id).maybeSingle();
    row.token_version = (data?.token_version ?? 1) + 1;
  }

  const { error } = await db.from("users").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await db.from("users").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function touchLogin(id: string, tokenVersion: number): Promise<void> {
  await db
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id)
    .eq("token_version", tokenVersion);
}
