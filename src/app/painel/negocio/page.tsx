import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { ATIVIDADES_SUGERIDAS, meiDoUsuario, rpcDb } from "@/lib/dominio/mei";
import PageHeader from "../PageHeader";
import NegocioForm from "./NegocioForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Meu negócio" };

/**
 * Cadastro do negócio. Única página do painel que NÃO usa `requireMei`: é
 * para cá que ele manda quem ainda não tem MEI.
 */
export default async function NegocioPage() {
  const user = await requireUser();
  const mei = await meiDoUsuario(rpcDb, user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        section="Meu negócio"
        title={mei ? "Meu negócio" : "Conte sobre o seu negócio"}
        summary={
          mei
            ? "Esses dados aparecem nos orçamentos, nas minutas e nas mensagens que o agente prepara."
            : "Antes de começar, o agente precisa saber quem você é. Esses dados vão nos orçamentos, nas minutas e nas mensagens."
        }
      />

      <section aria-label="Dados do negócio" className="card max-w-2xl">
        <NegocioForm
          primeiraVez={!mei}
          sugestoes={[...ATIVIDADES_SUGERIDAS]}
          inicial={{
            nome: mei?.nome ?? "",
            atividade: mei?.atividade ?? "",
            cidade: mei?.cidade ?? "",
            telefone: mei?.telefone ?? "",
            chave_pix: mei?.chave_pix ?? "",
          }}
        />
      </section>
    </div>
  );
}
