"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { dadosDoFormulario, meiDoUsuario, rpcDb, salvarMei } from "@/lib/dominio/mei";

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
