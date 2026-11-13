"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fakeVerify, hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { createSessionCookie, destroySessionCookie } from "@/lib/auth/cookie";
import { findForLogin, insertUser, probeUsers, touchLogin } from "@/lib/auth/users";
import {
  clearLoginFailures,
  clientIp,
  loginBlocked,
  loginKeys,
  registerLoginFailure,
} from "@/lib/auth/login-limit";

export type AuthState = { error?: string } | undefined;

/**
 * Limpa o Router Cache do cliente inteiro.
 *
 * O Next guarda no navegador o payload RSC das rotas já visitadas. Sem esta
 * limpeza, sair de uma conta e entrar em outra no mesmo navegador pode mostrar
 * a tela renderizada da conta anterior, com os clientes e documentos de outro
 * MEI. É a mesma razão de limpar na entrada
 * e na saída: os dois lados da troca precisam do descarte.
 */
function dropClientCache() {
  revalidatePath("/", "layout");
}

/**
 * Para onde mandar depois do login. O proxy guarda a rota pretendida em `?de=`,
 * e esse valor vem da URL — ou seja, de quem quiser montá-la.
 *
 * Só passa caminho interno. Sem esta trava, `?de=https://site-falso/` viraria um
 * open redirect: o atacante manda um link do SEU domínio, a pessoa faz login de
 * verdade e é cuspida num clone da tela pedindo a senha "de novo".
 * `//evil.com` também é bloqueado — o navegador lê isso como protocolo relativo
 * e sai do site igual.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/painel";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/painel";
  if (raw.startsWith("/login") || raw.startsWith("/setup") || raw.startsWith("/cadastro")) return "/painel";
  return raw;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("de") ?? "") || null);

  if (!email || !password) return { error: "Preencha email e senha." };

  // Limite de tentativas (src/lib/auth/login-limit.ts). A contagem é pelo
  // email DIGITADO, exista a conta ou não, e o aviso é o mesmo nos dois
  // casos — o bloqueio não revela quem tem conta aqui.
  const keys = loginKeys(email, clientIp((await headers()).get("x-forwarded-for")));
  if (await loginBlocked(keys)) {
    return { error: "Muitas tentativas. Espere alguns minutos e tente de novo." };
  }

  const user = await findForLogin(email);

  // Mesma mensagem para email inexistente e senha errada, e o mesmo custo de
  // CPU nos dois caminhos: senão dá para descobrir quem tem conta aqui, tanto
  // pelo texto quanto pelo tempo de resposta.
  if (!user) {
    await fakeVerify();
    await registerLoginFailure(keys);
    return { error: "Email ou senha incorretos." };
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await registerLoginFailure(keys);
    return { error: "Email ou senha incorretos." };
  }

  await clearLoginFailures(email);
  await createSessionCookie({ sub: user.id, role: user.role, ver: user.token_version });
  await touchLogin(user.id, user.token_version);

  dropClientCache();
  redirect(next);
}

export async function logout() {
  await destroySessionCookie();
  dropClientCache();
  redirect("/login");
}

/**
 * Cria uma conta de usuário. Se a tabela `users` estiver vazia, o primeiro
 * usuário nasce `admin`; os seguintes nascem `user`. Depois de criar a conta,
 * inicia a sessão e manda cadastrar o negócio em `/painel/negocio`.
 */
export async function criarConta(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const probe = await probeUsers();
  if (!probe.ok) return { error: `Banco indisponível: ${probe.message}` };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Informe seu nome." };
  if (!email.includes("@")) return { error: "Informe um email válido." };

  const bad = validatePassword(password);
  if (bad) return { error: bad };

  const role = probe.empty ? "admin" : "user";

  let created;
  try {
    created = await insertUser({
      email,
      name,
      password_hash: await hashPassword(password),
      role,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não deu pra criar a conta." };
  }
  if (!created) return { error: "Não deu pra criar a conta. Tente de novo." };

  await createSessionCookie({ sub: created.id, role, ver: 1 });
  dropClientCache();
  // Conta criada, negócio ainda não: o próximo passo do primeiro acesso.
  redirect("/painel/negocio");
}

export async function setupFirstAdmin(prev: AuthState, formData: FormData): Promise<AuthState> {
  return criarConta(prev, formData);
}
