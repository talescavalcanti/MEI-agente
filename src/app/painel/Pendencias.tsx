"use client";

import { useState, useTransition } from "react";
import type { PropostaParada } from "@/lib/agente/pendencias";
import { AuthError } from "../components/AuthShell";
import Button from "../components/Button";
import Cartao from "./agente/Cartao";
import { ignorarPendencia, verificarPendenciasAgora } from "./actions";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Propostas paradas do Início: orçamento enviado há dias, sem resposta do
 * cliente. Cada uma pode mostrar o lembrete que o agente redigiu (um cartão
 * de aprovação, nada sai sozinho) ou ser ignorada. "Verificar agora" faz na
 * hora o que o agendador faz de manhã.
 */
export default function Pendencias({ propostas }: { propostas: PropostaParada[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verificando, startVerificar] = useTransition();
  const [ignorando, startIgnorar] = useTransition();

  function verificar() {
    setErro(null);
    setAviso(null);
    startVerificar(async () => {
      const r = await verificarPendenciasAgora();
      if ("erro" in r) return setErro(r.erro);
      setAviso(
        r.sugeridas === 0
          ? "Nenhum lembrete novo para redigir."
          : r.sugeridas === 1
            ? "1 lembrete redigido. Revise antes de enviar."
            : `${r.sugeridas} lembretes redigidos. Revise antes de enviar.`,
      );
    });
  }

  function ignorar(tarefaId: string) {
    setErro(null);
    setAviso(null);
    startIgnorar(async () => {
      const r = await ignorarPendencia(tarefaId);
      if ("erro" in r) setErro(r.erro);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="compact" onClick={verificar} disabled={verificando}>
          {verificando ? "Verificando…" : "Verificar agora"}
        </Button>
        {aviso && (
          <p role="status" className="text-body-sm text-muted">
            {aviso}
          </p>
        )}
      </div>
      {erro && <AuthError>{erro}</AuthError>}

      {propostas.length === 0 ? (
        <p className="card text-body text-muted">Nenhuma proposta parada. Quando um orçamento ficar sem resposta por 3 dias, ele aparece aqui.</p>
      ) : (
        <ul className="space-y-4">
          {propostas.map((p) => {
            const lembreteAberto = aberto === p.servico_id && p.mensagem_id;
            return (
              <li key={p.servico_id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-title-card">
                      #{String(p.numero).padStart(3, "0")} · {p.descricao}
                    </h3>
                    <p className="mt-1 text-body-sm text-slate-700">
                      {p.cliente_nome}
                      {p.valor != null && ` · ${moeda.format(p.valor)}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-chip bg-warn-bg px-2.5 py-1 text-caption font-medium text-warn-text">
                    {p.dias_parado === 1 ? "1 dia sem resposta" : `${p.dias_parado} dias sem resposta`}
                  </span>
                </div>

                {!p.tarefa_id && (
                  <p className="text-body-sm text-muted">Clique em Verificar agora para o agente redigir um lembrete.</p>
                )}
                {p.tarefa_id && !p.mensagem_id && (
                  <p className="text-body-sm text-muted">O lembrete ainda não foi redigido. Tente Verificar agora.</p>
                )}

                {p.tarefa_id && (
                  <div className="flex flex-wrap gap-2">
                    {p.mensagem_id && (
                      <button
                        type="button"
                        onClick={() => setAberto(lembreteAberto ? null : p.servico_id)}
                        aria-expanded={Boolean(lembreteAberto)}
                        className="rounded-field bg-field px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-field-hover"
                      >
                        {lembreteAberto ? "Esconder lembrete" : "Ver lembrete"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => ignorar(p.tarefa_id!)}
                      disabled={ignorando}
                      className="rounded-field bg-field px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-field-hover disabled:opacity-55"
                    >
                      Ignorar
                    </button>
                  </div>
                )}

                {lembreteAberto && <Cartao cartao={{ tipo: "mensagem", id: p.mensagem_id! }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
