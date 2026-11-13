"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Cartao as CartaoRef } from "@/lib/agente/ferramentas/executar";
import type { ItemStatus } from "@/lib/dominio/tipos";
import { AuthError } from "../../components/AuthShell";
import Button from "../../components/Button";
import { decidirItem, marcarEnviada, verItem } from "./actions";
import type { CartaoDados, ResultadoCartao } from "./cartao-dados";
import EditarItem from "./EditarItem";

const STATUS: Record<ItemStatus, string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  descartado: "Descartado",
  enviado: "Enviada",
};

const TIPO: Record<CartaoRef["tipo"], string> = {
  orcamento: "Orçamento",
  contrato: "Contrato",
  mensagem: "Mensagem",
};

/**
 * Cartão de aprovação de um orçamento, minuta ou mensagem.
 *
 * Rascunho: [Aprovar] [Editar] [Descartar]. Mensagem aprovada: [Copiar]
 * [Abrir no WhatsApp] (só com whatsapp cadastrado) [Marcar como enviada].
 * Nada sai sozinho: o envio é sempre a pessoa, por fora.
 *
 * Sem `inicial`, busca o estado atual com `verItem` (cartão que acabou de
 * chegar pelo chat ou conversa recarregada). Toda ação devolve o cartão
 * relido do banco, e é ele que passa a valer.
 */
export default function Cartao({ cartao, inicial }: { cartao: CartaoRef; inicial?: CartaoDados }) {
  const [dados, setDados] = useState<CartaoDados | null>(inicial ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  function aplicar(r: ResultadoCartao) {
    if ("erro" in r) {
      setErro(r.erro);
    } else {
      setErro(null);
      setDados(r.cartao);
    }
  }

  useEffect(() => {
    if (inicial) return;
    startTransition(async () => aplicar(await verItem(cartao.tipo, cartao.id)));
  }, [cartao.tipo, cartao.id, inicial]);

  function agir(acao: () => Promise<ResultadoCartao>) {
    setAviso(null);
    startTransition(async () => aplicar(await acao()));
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Texto copiado.");
    } catch {
      setAviso("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }

  if (!dados) {
    return (
      <article className="card" aria-busy={pending}>
        <p className="text-body-sm text-muted">
          {erro ?? `Carregando ${TIPO[cartao.tipo].toLowerCase()}…`}
        </p>
      </article>
    );
  }

  const fechado = dados.status === "descartado" || dados.status === "enviado";

  return (
    <article className={`card space-y-4 ${fechado ? "opacity-70" : ""}`} aria-busy={pending}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted">{TIPO[dados.tipo]}</p>
          <h3 className="text-title-card font-semibold">{dados.titulo}</h3>
        </div>
        <span className="shrink-0 rounded-chip bg-tonal px-2.5 py-1 text-caption font-medium text-muted-on-tint">
          {STATUS[dados.status]}
        </span>
      </header>

      {dados.tipo === "orcamento" && (
        <div className="rounded-field bg-tonal p-4 text-body-sm">
          <ul className="space-y-1.5">
            {dados.orcamento.linhas.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{l.descricao}</span>
                <span className="shrink-0 tabular-nums">{l.valor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between gap-4 border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{dados.orcamento.total}</span>
          </p>
          <p className="mt-2 text-caption text-muted">
            {dados.orcamento.validade} · Pagamento: {dados.orcamento.pagamento}
          </p>
        </div>
      )}

      {dados.tipo === "contrato" && (
        <>
          <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
            {dados.aviso}
          </p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-field bg-tonal p-4 text-body-sm">
            {dados.texto}
          </p>
          <Link href={dados.documento} className="inline-block text-body-sm font-medium text-brand-500 hover:underline">
            Ver documento
          </Link>
        </>
      )}

      {dados.tipo === "mensagem" && (
        <>
          <p className="whitespace-pre-wrap rounded-field bg-tonal-blue p-4 text-body-sm">{dados.texto}</p>
          {dados.divergentes.length > 0 && (
            <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
              O texto cita {dados.divergentes.length === 1 ? "um valor diferente" : "valores diferentes"} do
              serviço{dados.valorServico ? ` (${dados.valorServico})` : ""}: {dados.divergentes.join(", ")}.
              Confira antes de aprovar.
            </p>
          )}
        </>
      )}

      {dados.status === "descartado" && <p className="text-body-sm text-muted">Descartado. Nada foi enviado.</p>}
      {dados.status === "enviado" && <p className="text-body-sm text-muted">Marcada como enviada.</p>}

      {erro && <AuthError>{erro}</AuthError>}
      {aviso && (
        <p role="status" className="text-body-sm text-muted">
          {aviso}
        </p>
      )}

      {dados.botoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dados.botoes.map((b) => {
            switch (b) {
              case "aprovar":
                return (
                  <Button key={b} size="compact" disabled={pending} onClick={() => agir(() => decidirItem(dados.tipo, dados.id, "aprovar"))}>
                    Aprovar
                  </Button>
                );
              case "editar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => setEditando(true)}>
                    Editar
                  </Secundario>
                );
              case "descartar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => agir(() => decidirItem(dados.tipo, dados.id, "descartar"))}>
                    Descartar
                  </Secundario>
                );
              case "copiar":
                return dados.tipo === "mensagem" ? (
                  <Button key={b} size="compact" onClick={() => copiar(dados.texto)}>
                    Copiar
                  </Button>
                ) : null;
              case "whatsapp": {
                if (dados.tipo !== "mensagem" || !dados.whatsapp) return null;
                const link = dados.whatsapp;
                return (
                  <Secundario key={b} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                    Abrir no WhatsApp
                  </Secundario>
                );
              }
              case "marcar_enviada":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => agir(() => marcarEnviada(dados.id))}>
                    Marcar como enviada
                  </Secundario>
                );
            }
          })}
        </div>
      )}

      {editando && (
        <EditarItem
          dados={dados}
          onClose={() => setEditando(false)}
          onSalvo={(novo) => {
            setDados(novo);
            setErro(null);
            setEditando(false);
          }}
        />
      )}
    </article>
  );
}

/** Ação secundária do cartão: bloco tonal, sem a seta do botão principal. */
function Secundario({
  children,
  onClick,
  disabled,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-field bg-field px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-field-hover disabled:opacity-55"
    >
      {children}
    </button>
  );
}
