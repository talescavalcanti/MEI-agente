"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarConta, type AuthState } from "../auth/actions";
import { AuthError, AuthField } from "../components/AuthShell";
import Button from "../components/Button";

export default function SetupForm({ temUsuarios = false }: { temUsuarios?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    criarConta,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <AuthField
        label="Seu nome"
        name="name"
        autoComplete="name"
        defaultValue={state?.name}
        autoFocus
      />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={state?.email}
      />
      <AuthField
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, com pelo menos uma letra e um número."
      />

      {state?.error && <AuthError>{state.error}</AuthError>}

      <Button type="submit" disabled={pending} block>
        {pending ? "Criando…" : "Criar conta e continuar"}
      </Button>

      {temUsuarios && (
        <p className="text-center text-body-sm text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="text-link font-medium text-brand-600">
            Entrar
          </Link>
        </p>
      )}
    </form>
  );
}
