"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { dadosDoFormulario, meiDoUsuario, mensagemDeRegra, requireMei, rpcDb, salvarMei } from "@/lib/dominio/mei";
import { documentoValido } from "@/lib/fiscal/documento";

export type NegocioState = { error?: string; salvo?: boolean } | undefined;

/**
 * Cadastra ou atualiza o negócio de quem está logado.
 *
 * O usuário vem da sessão, nunca do formulário: Server Action é endpoint
 * público. No primeiro cadastro segue para o Início; nas edições seguintes
 * fica na tela com o aviso de salvo.
 */
export async function salvarNegocio(_prev: NegocioState, formData: FormData): Promise<NegocioState> {
  const user = await requireUser();

  let primeiraVez: boolean;
  try {
    primeiraVez = !(await meiDoUsuario(rpcDb, user.id));
  } catch (e) {
    console.error("mei_do_usuario falhou:", e);
    return { error: "Não deu pra salvar agora. Tente de novo em instantes." };
  }

  const r = await salvarMei(rpcDb, user.id, dadosDoFormulario(formData));
  if (!r.ok) return { error: r.erro };

  revalidatePath("/painel", "layout");
  // Fora de try/catch: `redirect` funciona lançando.
  if (primeiraVez) redirect("/painel");
  return { salvo: true };
}

export type DadosFiscaisState = { error?: string; salvo?: boolean } | undefined;

const CAMPOS_FISCAIS = [
  "cnpj",
  "inscricao_municipal",
  "municipio",
  "codigo_tributacao",
  "nbs",
  "descricao_padrao_nota",
] as const;

/**
 * Dados fiscais do negócio, para a nota (Task 17). Só esses campos passam; o
 * MEI vem da sessão. O CNPJ é conferido aqui antes do banco (o SQL confere de
 * novo), e o erro `regra:` do SQL volta como frase. Campo em branco não
 * apaga o que já estava (mesma regra do `mei_dados_fiscais_salvar`).
 */
export async function salvarDadosFiscais(_prev: DadosFiscaisState, formData: FormData): Promise<DadosFiscaisState> {
  const { mei } = await requireMei();

  const dados: Record<string, string> = {};
  for (const campo of CAMPOS_FISCAIS) {
    const v = formData.get(campo);
    if (typeof v === "string" && v.trim()) dados[campo] = v.trim().slice(0, 500);
  }
  if (dados.cnpj) {
    const cnpj = documentoValido(dados.cnpj);
    if (!cnpj || cnpj.length !== 14) return { error: "CNPJ do negócio inválido." };
    dados.cnpj = cnpj;
  }

  try {
    await rpcDb("mei_dados_fiscais_salvar", { p_mei: mei.id, p_dados: dados });
  } catch (e) {
    const frase = mensagemDeRegra(e);
    if (frase) return { error: frase };
    console.error("mei_dados_fiscais_salvar falhou:", e);
    return { error: "Não deu pra salvar agora. Tente de novo em instantes." };
  }

  revalidatePath("/painel", "layout");
  return { salvo: true };
}
