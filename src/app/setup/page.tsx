import { probeUsers } from "@/lib/auth/users";
import AuthShell from "../components/AuthShell";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Criar conta · MEIagente" };

/**
 * Cadastro de conta. Se a tabela `users` estiver vazia, o primeiro usuário
 * vira `admin`; depois disso, novos cadastros nascem como `user`, cada um com
 * o próprio MEI cadastrado no passo seguinte (`/painel/negocio`).
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

  return (
    <AuthShell
      title={probe.empty ? "Primeiro acesso" : "Criar conta"}
      subtitle="Crie a sua conta. No passo seguinte você cadastra o seu negócio."
    >
      <SetupForm temUsuarios={!probe.empty} />
    </AuthShell>
  );
}
