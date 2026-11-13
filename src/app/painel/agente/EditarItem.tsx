"use client";

import { useState, useTransition } from "react";
import { AuthError } from "../../components/AuthShell";
import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import { editarItem } from "./actions";
import type { CartaoDados } from "./cartao-dados";

type Linha = { descricao: string; valor: string };

/** `1200.5` → `"1200,50"`: o campo aceita vírgula, e o servidor converte. */
const paraCampo = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Edição de um rascunho: texto da mensagem, minuta do contrato ou itens e
 * validade do orçamento. O servidor valida e o banco confere a soma do
 * orçamento; erro volta como frase e a janela continua aberta.
 */
export default function EditarItem({
  dados,
  onClose,
  onSalvo,
}: {
  dados: CartaoDados;
  onClose: () => void;
  onSalvo: (novo: CartaoDados) => void;
}) {
  const [texto, setTexto] = useState(
    dados.tipo === "mensagem" ? dados.edicao.conteudo : dados.tipo === "contrato" ? dados.edicao.minuta : "",
  );
  const [linhas, setLinhas] = useState<Linha[]>(
    dados.tipo === "orcamento"
      ? dados.edicao.itens.map((i) => ({ descricao: i.descricao, valor: paraCampo(i.valor) }))
      : [],
  );
  const [validade, setValidade] = useState(dados.tipo === "orcamento" ? String(dados.edicao.validade_dias) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const payload =
      dados.tipo === "mensagem"
        ? { conteudo: texto }
        : dados.tipo === "contrato"
          ? { minuta: texto }
          : { itens: linhas, validade_dias: validade };
    startTransition(async () => {
      const r = await editarItem(dados.tipo, dados.id, payload);
      if ("erro" in r) setErro(r.erro);
      else onSalvo(r.cartao);
    });
  }

  const mudarLinha = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const titulo =
    dados.tipo === "mensagem" ? "Editar mensagem" : dados.tipo === "contrato" ? "Editar minuta" : "Editar orçamento";

  return (
    <Dialog title={titulo} subtitle={dados.titulo} onClose={onClose}>
      <form onSubmit={salvar} className="space-y-5 px-5 pb-6 pt-4 sm:px-7">
        {dados.tipo !== "orcamento" ? (
          <label className="block">
            <span className="field-label">{dados.tipo === "mensagem" ? "Texto da mensagem" : "Minuta"}</span>
            <textarea
              data-autofocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={dados.tipo === "mensagem" ? 8 : 16}
              maxLength={dados.tipo === "mensagem" ? 2000 : undefined}
              className="field resize-y"
            />
          </label>
        ) : (
          <>
            <fieldset className="space-y-3">
              <legend className="field-label">Itens</legend>
              {linhas.map((l, i) => (
                <div key={i} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Descrição do item {i + 1}</span>
                    <input
                      data-autofocus={i === 0 ? true : undefined}
                      value={l.descricao}
                      onChange={(e) => mudarLinha(i, "descricao", e.target.value)}
                      maxLength={200}
                      placeholder="Descrição"
                      className="field"
                    />
                  </label>
                  <label className="w-32 shrink-0">
                    <span className="sr-only">Valor do item {i + 1}, em reais</span>
                    <input
                      value={l.valor}
                      onChange={(e) => mudarLinha(i, "valor", e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="field text-right tabular-nums"
                    />
                  </label>
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                      className="mb-2 shrink-0 text-body-sm text-muted hover:text-danger-text"
                      aria-label={`Remover item ${i + 1}`}
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLinhas((ls) => [...ls, { descricao: "", valor: "" }])}
                className="text-body-sm font-medium text-brand-500 hover:underline"
              >
                Adicionar item
              </button>
              <p className="text-caption text-muted">A soma dos itens precisa dar o valor do orçamento.</p>
            </fieldset>
            <label className="block">
              <span className="field-label">Validade (dias)</span>
              <input
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                inputMode="numeric"
                className="field w-32"
              />
            </label>
          </>
        )}

        {erro && <AuthError>{erro}</AuthError>}

        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </Dialog>
  );
}
