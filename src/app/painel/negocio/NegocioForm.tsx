"use client";

import { useActionState, useState } from "react";
import { documentoValido } from "@/lib/fiscal/documento";
import type { CodigoSugerido } from "@/lib/fiscal/tipos";
import { AuthError } from "../../components/AuthShell";
import Button from "../../components/Button";
import { salvarDadosFiscais, salvarNegocio, type DadosFiscaisState, type NegocioState } from "./actions";

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

// ---------------------------------------------------------------- dados fiscais

type InicialFiscal = {
  cnpj: string;
  inscricao_municipal: string;
  municipio: string;
  codigo_tributacao: string;
  nbs: string;
  descricao_padrao_nota: string;
};

/** `140101` → `14.01.01`. */
const formatarCodigo = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c);
/** `120018100` → `1.2001.81.00`. */
const formatarNbs = (c: string) => (/^\d{9}$/.test(c) ? `${c[0]}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : c);

/**
 * Dados fiscais do negócio, usados pelo agente para preparar a nota. O CNPJ é
 * conferido no navegador antes de enviar (e de novo no servidor e no banco).
 * As sugestões de código vêm da tabela oficial; o NBS sugerido por descrição
 * leva "confira o NBS".
 */
export function DadosFiscaisForm({ inicial, sugestoes }: { inicial: InicialFiscal; sugestoes: CodigoSugerido[] }) {
  const [state, action, pending] = useActionState<DadosFiscaisState, FormData>(salvarDadosFiscais, undefined);
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);
  const [codigo, setCodigo] = useState(formatarCodigo(inicial.codigo_tributacao));
  const [nbs, setNbs] = useState(formatarNbs(inicial.nbs));

  function conferirCnpj(e: React.FormEvent<HTMLFormElement>) {
    const cnpj = String(new FormData(e.currentTarget).get("cnpj") ?? "").trim();
    const ok = !cnpj || documentoValido(cnpj)?.length === 14;
    setErroCnpj(ok ? null : "CNPJ do negócio inválido. Confira os números.");
    if (!ok) e.preventDefault();
  }

  const erro = erroCnpj ?? state?.error;

  return (
    <form action={action} onSubmit={conferirCnpj} className="space-y-5">
      <Campo label="CNPJ do negócio" name="cnpj" defaultValue={inicial.cnpj} hint="Aceita com ou sem pontos." />
      <Campo label="Inscrição municipal (se tiver)" name="inscricao_municipal" defaultValue={inicial.inscricao_municipal} />
      <Campo
        label="Município"
        name="municipio"
        defaultValue={inicial.municipio}
        hint="Onde o negócio está registrado. Avisa quando o serviço for em outra cidade."
      />

      {sugestoes.length > 0 && (
        <div className="space-y-2">
          <p className="field-label">Códigos sugeridos para a sua atividade</p>
          <ul className="space-y-2">
            {sugestoes.map((s) => (
              <li
                key={`${s.codigo_tributacao}-${s.nbs}`}
                className="flex flex-wrap items-start justify-between gap-3 rounded-field bg-tonal px-4 py-3 text-body-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatarCodigo(s.codigo_tributacao)}
                    {s.nbs && ` · NBS ${formatarNbs(s.nbs)}`}
                    {s.nbs && !s.nbs_conferido && (
                      <span className="ml-2 rounded-chip bg-warn-bg px-2 py-0.5 text-caption text-warn-text">
                        confira o NBS
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-caption text-muted">{s.descricao}</p>
                </div>
                <button
                  type="button"
                  className="rounded-field px-2.5 py-1 text-caption font-medium text-brand-600 hover:bg-tonal-blue"
                  onClick={() => {
                    setCodigo(formatarCodigo(s.codigo_tributacao));
                    setNbs(s.nbs ? formatarNbs(s.nbs) : "");
                  }}
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="field-label">Código de tributação nacional</span>
        <input
          name="codigo_tributacao"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="14.01.01"
          autoComplete="off"
          maxLength={20}
          className="field"
        />
        <span className="mt-1.5 block text-caption text-muted">6 dígitos, como aparece no Emissor Nacional.</span>
      </label>
      <label className="block">
        <span className="field-label">NBS (opcional)</span>
        <input
          name="nbs"
          value={nbs}
          onChange={(e) => setNbs(e.target.value)}
          placeholder="1.2001.81.00"
          autoComplete="off"
          maxLength={20}
          className="field"
        />
      </label>
      <Campo
        label="Descrição padrão da nota (opcional)"
        name="descricao_padrao_nota"
        defaultValue={inicial.descricao_padrao_nota}
        hint="Usada quando o serviço não tiver uma descrição própria."
      />

      {erro && <AuthError>{erro}</AuthError>}
      {state?.salvo && !pending && !erroCnpj && (
        <p role="status" className="text-body-sm text-muted">
          Dados fiscais salvos.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar dados fiscais"}
      </Button>
    </form>
  );
}
