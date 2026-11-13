"use client";

import { useActionState } from "react";
import { setupFirstAdmin, type AuthState } from "../auth/actions";
import { AuthError, AuthField } from "../components/AuthShell";
import Button from "../components/Button";

export default function SetupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    setupFirstAdmin,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <AuthField label="Seu nome" name="name" autoComplete="name" autoFocus />
      <AuthField label="Email" name="email" type="email" autoComplete="username" />
      <AuthField
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, com pelo menos uma letra e um número."
      />

      {state?.error && <AuthError>{state.error}</AuthError>}

      <Button type="submit" disabled={pending} block>
        {pending ? "Criando…" : "Criar administrador"}
      </Button>
    </form>
  );
}
