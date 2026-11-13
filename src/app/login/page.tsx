import { redirect } from "next/navigation";
import { probeUsers } from "@/lib/auth/users";
import AuthShell from "../components/AuthShell";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Entrar · MEIagente" };

export default async function LoginPage() {
  // Banco sem usuário nenhum: não há em que entrar. Manda montar o primeiro
  // admin em vez de mostrar um formulário que sempre vai recusar. Se a tabela
  // nem existe, /setup é quem explica o que fazer — mandar pra lá também.
  const probe = await probeUsers();
  if (!probe.ok || probe.empty) redirect("/setup");

  return (
    <AuthShell title="Entrar" subtitle="Acesse o painel do MEIagente.">
      <LoginForm />
    </AuthShell>
  );
}
