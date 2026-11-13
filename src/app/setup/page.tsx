import { notFound } from "next/navigation";
import { probeUsers } from "@/lib/auth/users";
import AuthShell from "../components/AuthShell";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Primeiro acesso · MEIagente" };

/**
 * Cria o primeiro administrador e some.
 *
 * A rota só existe enquanto a tabela `users` está vazia. Assim que houver um
 * usuário, responde 404: `notFound()` e não um redirect para o login, porque
 * redirecionar confirmaria que a rota existe. Para quem sonda o app depois de
 * instalado, /setup simplesmente não está lá.
 *
 * Qualquer resposta que não seja um "está vazia" confirmado NÃO mostra o
 * formulário. Falhar fechado é o ponto: o formulário cria um administrador.
 */
export default async function SetupPage() {
  const probe = await probeUsers();

  if (!probe.ok) {
    return (
      <AuthShell
        title={probe.reason === "missing_table" ? "Falta criar a tabela" : "Banco indisponível"}
        subtitle={
          probe.reason === "missing_table"
            ? "O banco ainda não tem a tabela de usuários."
            : "Não deu pra falar com o banco agora."
        }
      >
        {probe.reason === "missing_table" ? (
          <div className="space-y-4">
            <p className="text-body-sm leading-[1.7] text-slate-600">
              Abra o <strong className="text-slate-900">SQL Editor do Supabase</strong> e rode o
              conteúdo de:
            </p>
            <code className="block rounded-chip bg-tonal px-3.5 py-2.5 font-mono text-body-sm text-slate-900 select-all">
              supabase/01-auth.sql
            </code>
            <p className="text-body-sm leading-[1.6] text-muted">
              Depois recarregue esta página. Se acabou de rodar e ainda aparece isto, espere alguns
              segundos: o PostgREST leva um instante para recarregar o schema.
            </p>
          </div>
        ) : (
          <p className="text-body-sm leading-[1.7] text-slate-600">{probe.message}</p>
        )}
      </AuthShell>
    );
  }

  if (!probe.empty) notFound();

  return (
    <AuthShell
      title="Primeiro acesso"
      subtitle="Crie a sua conta. No passo seguinte você cadastra o seu negócio."
    >
      <SetupForm />
    </AuthShell>
  );
}
