import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { readSessionToken } from "./cookie";
import { verifySession, type Role } from "./session";

/**
 * Data Access Layer. Toda checagem de "quem é" e "pode o quê" passa por aqui.
 *
 * O `src/proxy.ts` também olha a sessão, mas só para redirecionar cedo — ele lê
 * o cookie e nada mais. A decisão que vale é esta, colada no dado: proxy roda
 * antes do render, não enxerga Server Action nem Route Handler, e o próprio doc
 * do Next é explícito em não tratá-lo como camada de autorização.
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * CHAVE DE CACHE POR USUÁRIO.
 *
 * `cache()` do React memoriza pelo argumento, dentro de um único render. O
 * argumento aqui é o token da sessão, então a chave é, literalmente, a
 * identidade de quem pediu: dois usuários nunca compartilham entrada.
 *
 * O detalhe importante é *por que* o token entra como parâmetro em vez de ser
 * lido lá dentro. Uma função sem argumento teria chave única e global: numa
 * mesma instância do servidor, o primeiro usuário a renderizar preencheria o
 * cache e os outros receberiam os dados dele. Fazer o token ser o argumento
 * torna esse erro impossível de escrever.
 *
 * Este cache é por requisição — não persiste entre requisições nem entre
 * usuários. Serve para que layout, página e as ações de um mesmo render não
 * batam três vezes no banco pela mesma pessoa.
 */
const loadUserByToken = cache(async (token: string): Promise<SessionUser | null> => {
  const payload = await verifySession(token);
  if (!payload) return null;

  const { data, error } = await db
    .from("users")
    .select("id,email,name,role,token_version")
    .eq("id", payload.sub)
    .maybeSingle();

  if (error || !data) return null;

  // O papel vem do BANCO, não do token: se o admin rebaixou alguém há um
  // minuto, o JWT na mão da pessoa ainda diz "admin" e vale por até 12h.
  // Confiar no `payload.role` aqui daria acesso de admin a um ex-admin.
  if (data.token_version !== payload.ver) return null; // senha trocada / sessões derrubadas

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role as Role,
  };
});

/** Usuário da requisição atual, ou null. Não redireciona. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return loadUserByToken(token);
}

/** Exige sessão válida. Manda pro login se não houver. Use em página e action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige admin. Quem está logado mas não é admin vai para o painel, não para o
 * login — mandar pro login sugeriria que basta reautenticar, e a pessoa ficaria
 * em laço tentando entrar numa porta que o papel dela não abre.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/painel");
  return user;
}

/**
 * Versão para Route Handler: devolve o usuário ou uma Response de erro, em vez
 * de redirecionar. Um fetch que recebe 302 para o HTML do login é confuso do
 * lado do cliente — 401 diz a verdade.
 */
export async function requireUserApi(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Não autenticado." }, { status: 401, headers: PRIVATE_HEADERS }),
    };
  }
  return { ok: true, user };
}

export async function requireAdminApi(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const res = await requireUserApi();
  if (!res.ok) return res;
  if (res.user.role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "Sem permissão." }, { status: 403, headers: PRIVATE_HEADERS }),
    };
  }
  return res;
}

/**
 * Cabeçalhos para toda resposta que carrega dado de usuário autenticado.
 *
 * `private` proíbe CDN e proxy de guardar a resposta — sem isso a borda da
 * Vercel poderia servir a lista de clientes de uma sessão para a próxima
 * pessoa que pedisse a mesma URL. `Vary: Cookie` diz que a resposta depende de
 * quem pediu, para qualquer cache intermediário que ainda assim resolva
 * guardá-la.
 */
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
} as const;
