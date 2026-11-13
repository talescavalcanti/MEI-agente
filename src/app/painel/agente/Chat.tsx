"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Cartao as CartaoRef } from "@/lib/agente/ferramentas/executar";
import { formatSP } from "@/lib/tz";
import Cartao from "./Cartao";
import { lerEventos } from "./ndjson";

/** Uma fala na tela. A do assistente junta texto, ferramentas e cartões do turno. */
export type Bolha = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  ferramentas: { nome: string; erro: boolean }[];
  cartoes: CartaoRef[];
};

export type ConversaResumo = { id: string; titulo: string | null; criado_em: string };

/** Linha discreta que aparece enquanto o agente usa cada ferramenta. */
const ROTULO_FERRAMENTA: Record<string, string> = {
  buscar_cliente: "Procurando cliente",
  criar_ou_atualizar_cliente: "Salvando cliente",
  registrar_servico: "Registrando serviço",
  atualizar_servico: "Atualizando serviço",
  listar_dados_faltantes: "Conferindo o que falta",
  listar_servicos: "Consultando serviços",
  mudar_status_servico: "Mudando status do serviço",
  gerar_orcamento: "Preparando orçamento",
  gerar_minuta_contrato: "Preparando minuta de contrato",
  redigir_mensagem: "Redigindo mensagem",
  salvar_rascunho_post: "Redigindo post",
  agendar_servico: "Agendando serviço",
  consultar_agenda: "Consultando agenda",
  listar_propostas_pendentes: "Conferindo propostas paradas",
  registrar_pagamento: "Registrando pagamento",
  salvar_memoria: "Guardando preferência",
};

const MAX_TEXTO = 4000;

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Frase para cada resposta de erro da rota de chat. */
async function erroHttp(res: Response): Promise<string> {
  if (res.status === 401) return "Sua sessão expirou. Entre de novo para continuar.";
  if (res.status === 409) return "Cadastre o seu negócio em Meu negócio antes de falar com o agente.";
  try {
    const corpo = (await res.json()) as { erro?: unknown; error?: unknown };
    const msg = corpo.erro ?? corpo.error;
    if (typeof msg === "string" && msg) return msg;
  } catch {
    // corpo não é JSON
  }
  if (res.status === 400) return "Mensagem vazia ou longa demais.";
  return "O agente não respondeu agora. Tente de novo em instantes.";
}

export default function Chat({
  conversas,
  conversaId,
  inicial,
  erroCarga,
}: {
  conversas: ConversaResumo[];
  conversaId: string | null;
  inicial: Bolha[];
  erroCarga: string | null;
}) {
  const router = useRouter();
  const [bolhas, setBolhas] = useState<Bolha[]>(inicial);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(erroCarga);
  const idAtual = useRef<string | null>(conversaId);
  const fimDaLista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [bolhas]);

  /** Mexe só na bolha do assistente deste turno. */
  function atualizar(id: string, f: (b: Bolha) => Bolha) {
    setBolhas((bs) => bs.map((b) => (b.id === id ? f(b) : b)));
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    if (conteudo.length > MAX_TEXTO) {
      setErro(`A mensagem passou de ${MAX_TEXTO} caracteres. Divida em partes.`);
      return;
    }
    setErro(null);
    setTexto("");
    setEnviando(true);

    const idAssistente = novoId();
    setBolhas((bs) => [
      ...bs,
      { id: novoId(), papel: "usuario", texto: conteudo, ferramentas: [], cartoes: [] },
      { id: idAssistente, papel: "assistente", texto: "", ferramentas: [], cartoes: [] },
    ]);

    let novaConversa: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversaId: idAtual.current, texto: conteudo }),
      });
      if (!res.ok || !res.body) {
        setErro(await erroHttp(res));
        return;
      }
      for await (const ev of lerEventos(res.body)) {
        switch (ev.tipo) {
          case "texto":
            atualizar(idAssistente, (b) => ({ ...b, texto: b.texto + ev.delta }));
            break;
          case "ferramenta":
            atualizar(idAssistente, (b) => ({ ...b, ferramentas: [...b.ferramentas, { nome: ev.nome, erro: ev.erro }] }));
            break;
          case "cartao":
            atualizar(idAssistente, (b) =>
              b.cartoes.some((c) => c.id === ev.cartao.id) ? b : { ...b, cartoes: [...b.cartoes, ev.cartao] },
            );
            break;
          case "fim":
            if (ev.conversaId) {
              if (ev.conversaId !== idAtual.current) novaConversa = ev.conversaId;
              idAtual.current = ev.conversaId;
            }
            break;
          case "erro":
            setErro(ev.mensagem);
            break;
        }
      }
    } catch {
      setErro("A conexão caiu no meio da resposta. O que já foi feito está salvo; mande a mensagem de novo.");
    } finally {
      setEnviando(false);
      // Bolha do assistente que ficou vazia (erro antes de qualquer resposta) some.
      setBolhas((bs) =>
        bs.filter((b) => b.id !== idAssistente || b.texto || b.ferramentas.length || b.cartoes.length),
      );
    }

    // Conversa nova: a URL passa a apontar para ela (F5 reabre a mesma) e a
    // lista da esquerda ganha a linha.
    if (novaConversa) router.replace(`/painel/agente?c=${novaConversa}`, { scroll: false });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-5">
      {/* Conversas */}
      <nav aria-label="Conversas" className="card h-fit p-3 sm:p-3">
        <Link
          href="/painel/agente"
          className="flex w-full items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-body-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          Nova conversa
        </Link>
        {conversas.length > 0 ? (
          <ul className="mt-3 max-h-[60vh] space-y-1 overflow-auto">
            {conversas.map((c) => {
              const ativa = c.id === conversaId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/painel/agente?c=${c.id}`}
                    aria-current={ativa ? "page" : undefined}
                    className={`block rounded-field px-3 py-2 text-body-sm transition-colors ${
                      ativa ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-tonal"
                    }`}
                  >
                    <span className="line-clamp-1">{c.titulo || "Conversa"}</span>
                    <span className="block text-[0.75rem] text-muted">{formatSP(c.criado_em)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 px-1 text-body-sm text-muted-on-tint">Nenhuma conversa ainda.</p>
        )}
      </nav>

      {/* Conversa aberta */}
      <section aria-label="Conversa com o agente" className="card flex min-h-[60vh] flex-col p-0 sm:p-0">
        <div className="flex-1 space-y-4 overflow-auto px-4 py-5 sm:px-6" aria-live="polite">
          {bolhas.length === 0 && (
            <div className="mx-auto max-w-md py-10 text-center">
              <p className="font-medium text-slate-900">Conte um serviço como contaria para um ajudante.</p>
              <p className="mt-2 text-body-sm text-muted-on-tint">
                Por exemplo: &ldquo;Fechei uma instalação elétrica com a Maria, R$ 800, sexta às 14h.&rdquo; O agente
                registra, pergunta o que faltar e prepara orçamento, minuta e mensagem para você aprovar.
              </p>
            </div>
          )}

          {bolhas.map((b) =>
            b.papel === "usuario" ? (
              <div key={b.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-[1rem_1rem_0.25rem_1rem] bg-brand-500 px-4 py-2.5 text-body-sm text-white">
                  {b.texto}
                </p>
              </div>
            ) : (
              <div key={b.id} className="max-w-[92%] space-y-2">
                {b.ferramentas.length > 0 && (
                  <ul className="space-y-0.5">
                    {b.ferramentas.map((f, i) => (
                      <li key={i} className={`text-[0.8rem] ${f.erro ? "text-danger-text" : "text-muted"}`}>
                        {ROTULO_FERRAMENTA[f.nome] ?? f.nome}
                        {f.erro ? ": não deu certo" : "…"}
                      </li>
                    ))}
                  </ul>
                )}
                {b.texto && (
                  <p className="dm-bubble whitespace-pre-wrap px-4 py-2.5 text-body-sm text-slate-800">{b.texto}</p>
                )}
                {!b.texto && !b.ferramentas.length && enviando && (
                  <p className="text-body-sm text-muted">Pensando…</p>
                )}
                {b.cartoes.map((c) => (
                  <Cartao key={`${c.tipo}-${c.id}`} cartao={c} />
                ))}
              </div>
            ),
          )}
          <div ref={fimDaLista} />
        </div>

        {erro && (
          <p role="alert" className="mx-4 mb-2 rounded-field bg-danger-bg px-4 py-3 text-body-sm text-danger-text sm:mx-6">
            {erro}
          </p>
        )}

        <form
          className="flex items-end gap-2 border-t border-line px-4 py-3 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <label htmlFor="fala" className="sr-only">
            Mensagem para o agente
          </label>
          <textarea
            id="fala"
            rows={2}
            maxLength={MAX_TEXTO}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder="Escreva para o agente…"
            className="field min-h-[3rem] flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="rounded-full bg-brand-500 px-5 py-2.5 text-body-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-55"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </form>
      </section>
    </div>
  );
}
