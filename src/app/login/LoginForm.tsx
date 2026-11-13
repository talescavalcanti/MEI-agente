"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "../auth/actions";
import { AuthError, AuthField } from "../components/AuthShell";
import Button from "../components/Button";

export default function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  // Rota que a pessoa tentou abrir antes de cair aqui, guardada pelo proxy.
  // A action valida este valor antes de usar — ele vem da URL.
  const de = useSearchParams().get("de") ?? "";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="de" value={de} />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={state?.email}
        autoFocus={!state?.email}
      />
      <AuthField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus={Boolean(state?.email)}
      />

      {state?.error && <AuthError>{state.error}</AuthError>}

      <Button type="submit" disabled={pending} block>
        {pending ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-center text-body-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="text-link font-medium text-brand-600">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
