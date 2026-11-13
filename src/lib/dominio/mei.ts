import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/supabase";
import type { Mei, MeiDados, Rpc } from "./tipos";

/** Sugestões do campo "atividade". O campo é livre: são só atalhos. */
export const ATIVIDADES_SUGERIDAS = ["Eletricista", "Técnico de manutenção", "Fotógrafo"] as const;

const ERRO_GENERICO = "Não deu pra salvar agora. Tente de novo em instantes.";

/**
 * `Rpc` de produção sobre o supabase-js, no contrato do plano: devolve o
 * `data` e lança `Error` com o `error.message` cru do Postgres, para o
 * prefixo `regra:` chegar intacto a quem chamou.
 */
export const rpcDb: Rpc = async (nome, args) => {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data ?? null;
};

/**
 * O MEI do usuário, ou null se ele ainda não cadastrou o negócio.
 *
 * `mei_do_usuario` devolve um composto nulo quando não há linha. O PostgREST
 * serializa isso como um objeto com todos os campos nulos, não como `null`;
 * sem `id` é tratado como "não tem".
 */
export async function meiDoUsuario(rpc: Rpc, userId: string): Promise<Mei | null> {
  const mei = (await rpc("mei_do_usuario", { p_user: userId })) as Mei | null;
  return mei?.id ? mei : null;
}

export type SalvarMeiResultado = { ok: true; mei: Mei } | { ok: false; erro: string };

/**
 * Cria ou atualiza o MEI do usuário. Violação de regra do SQL vira frase para
 * a tela; qualquer outro erro vira mensagem genérica (o texto do banco fica no
 * log, não na cara do usuário).
 */
export async function salvarMei(rpc: Rpc, userId: string, dados: MeiDados): Promise<SalvarMeiResultado> {
  try {
    const mei = (await rpc("mei_salvar", { p_user: userId, p_dados: dados })) as Mei;
    return { ok: true, mei };
  } catch (e) {
    const amigavel = mensagemDeRegra(e);
    if (amigavel) return { ok: false, erro: amigavel };
    console.error("mei_salvar falhou:", e);
    return { ok: false, erro: ERRO_GENERICO };
  }
}

/** `regra: informe o nome do negócio` → `Informe o nome do negócio.` Null se não for regra. */
export function mensagemDeRegra(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg.startsWith("regra:")) return null;
  const frase = msg.slice("regra:".length).trim();
  if (!frase) return null;
  const capitalizada = frase[0].toUpperCase() + frase.slice(1);
  return /[.!?]$/.test(capitalizada) ? capitalizada : `${capitalizada}.`;
}

const CAMPOS = ["nome", "atividade", "cidade", "telefone", "chave_pix"] as const;

/**
 * Lê só os campos do negócio. Campo em branco fica de fora (o SQL também
 * ignora branco), e qualquer outro campo enviado é descartado: o dono do MEI
 * vem da sessão, nunca do formulário.
 */
export function dadosDoFormulario(fd: FormData): MeiDados {
  const dados: MeiDados = {};
  for (const campo of CAMPOS) {
    const v = fd.get(campo);
    if (typeof v !== "string") continue;
    const limpo = v.trim();
    if (limpo) dados[campo] = limpo;
  }
  return dados;
}

/** Um MEI por usuário por render: layout, página e ação não repetem a consulta. */
const meiPorUsuario = cache((userId: string) => meiDoUsuario(rpcDb, userId));

/**
 * Exige sessão e negócio cadastrado. Sem sessão, vai para o login (via
 * `requireUser`); sem MEI, para `/painel/negocio`. Use no começo de toda
 * página do painel, menos a própria `negocio`.
 */
export async function requireMei(): Promise<{ user: SessionUser; mei: Mei }> {
  const user = await requireUser();
  const mei = await meiPorUsuario(user.id);
  if (!mei) redirect("/painel/negocio");
  return { user, mei };
}
