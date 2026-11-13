"use client";

import { useActionState } from "react";
import { AuthError } from "../../components/AuthShell";
import Button from "../../components/Button";
import { salvarNegocio, type NegocioState } from "./actions";

type Inicial = { nome: string; atividade: string; cidade: string; telefone: string; chave_pix: string };

export default function NegocioForm({
  primeiraVez,
  sugestoes,
  inicial,
}: {
  primeiraVez: boolean;
  sugestoes: string[];
  inicial: Inicial;
}) {
  const [state, action, pending] = useActionState<NegocioState, FormData>(salvarNegocio, undefined);

  return (
    <form action={action} className="space-y-5">
      <Campo label="Nome do negócio" name="nome" defaultValue={inicial.nome} required autoFocus={primeiraVez} />
      <Campo
        label="Atividade"
        name="atividade"
        defaultValue={inicial.atividade}
        list="atividades-sugeridas"
        hint="Escreva do seu jeito ou escolha uma sugestão."
      />
      <datalist id="atividades-sugeridas">
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Campo label="Cidade" name="cidade" defaultValue={inicial.cidade} autoComplete="address-level2" />
      <Campo label="Telefone" name="telefone" type="tel" defaultValue={inicial.telefone} autoComplete="tel" />
      <Campo
        label="Chave Pix (opcional)"
        name="chave_pix"
        defaultValue={inicial.chave_pix}
        hint="Vai no orçamento, para o cliente pagar."
      />

      {state?.error && <AuthError>{state.error}</AuthError>}
      {state?.salvo && !pending && (
        <p role="status" className="text-body-sm text-muted">
          Dados salvos.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : primeiraVez ? "Salvar e começar" : "Salvar"}
      </Button>
    </form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  autoFocus,
  autoComplete,
  list,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  list?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete ?? "off"}
        list={list}
        maxLength={200}
        className="field"
      />
      {hint && <span className="mt-1.5 block text-caption text-muted">{hint}</span>}
    </label>
  );
}
