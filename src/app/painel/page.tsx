import type { Metadata } from "next";
import Link from "next/link";
import type { PropostaParada } from "@/lib/agente/pendencias";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { AgendaItem, ItemTipo } from "@/lib/dominio/tipos";
import { APP_TZ, formatSP, ymdSP } from "@/lib/tz";
import Button from "../components/Button";
import Cartao from "./agente/Cartao";
import PageHeader from "./PageHeader";
import Pendencias from "./Pendencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mesmo segmento do painel/layout.tsx: o template de título dele não vale
// aqui (só para as abas filhas), então o título vai completo.
export const metadata: Metadata = { title: "Início · MEIagente" };

/** Cartões de rascunho mostrados no Início; o resto fica nas abas. */
const MAX_RASCUNHOS = 6;

type DocumentoListado = { id: string; tipo: "orcamento" | "contrato"; status: string; criado_em: string };
type MensagemListada = { id: string; criado_em: string };

/**
 * Início: o que pede atenção hoje. Agenda do dia, rascunhos esperando a
 * decisão do usuário e propostas paradas (com o lembrete que o agente
 * redigiu).
 */
export default async function Inicio() {
  const { user: me, mei } = await requireMei();
  const agora = requestNow();
  const hoje = ymdSP(new Date(agora));

  const [agenda, propostas, documentos, mensagens] = await Promise.all([
    rpcDb("agenda_listar", { p_mei: mei.id, p_de: hoje, p_ate: hoje }) as Promise<AgendaItem[]>,
    rpcDb("propostas_paradas", { p_mei: mei.id }) as Promise<PropostaParada[]>,
    rpcDb("documentos_listar", { p_mei: mei.id }) as Promise<DocumentoListado[]>,
    rpcDb("mensagens_listar", { p_mei: mei.id, p_status: "rascunho" }) as Promise<MensagemListada[]>,
  ]);

  // O lembrete de proposta parada já aparece lá embaixo, junto da proposta.
  const lembretes = new Set(propostas.map((p) => p.mensagem_id).filter(Boolean));
  const rascunhos: { tipo: ItemTipo; id: string; criado_em: string }[] = [
    ...documentos
      .filter((d) => d.status === "rascunho")
      .map((d) => ({ tipo: d.tipo, id: d.id, criado_em: d.criado_em })),
    ...mensagens
      .filter((m) => !lembretes.has(m.id))
      .map((m) => ({ tipo: "mensagem" as const, id: m.id, criado_em: m.criado_em })),
  ].sort((a, b) => b.criado_em.localeCompare(a.criado_em));

  return (
    <div className="space-y-10">
      <PageHeader
        section="Início"
        title={`${greeting(agora)}, ${firstName(me.name)}.`}
        summary="O que pede a sua atenção hoje. Nada é enviado sem você aprovar."
        actions={<Button href="/painel/agente">Falar com o agente</Button>}
      />

      <Secao titulo="Hoje" resumo={formatSP(agora, { dateStyle: "full" })}>
        {agenda.length === 0 ? (
          <p className="card text-body text-muted">Nenhum serviço agendado para hoje.</p>
        ) : (
          <ol className="space-y-3">
            {agenda.map((a) => (
              <li key={a.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-title-card">
                    #{String(a.numero).padStart(3, "0")} · {a.descricao}
                  </h3>
                  <p className="mt-1 text-body-sm text-slate-700">
                    {a.cliente_nome} · {a.local ?? "Local não informado"}
                  </p>
                </div>
                <time className="shrink-0 text-body-sm font-semibold text-brand-600" dateTime={a.inicio}>
                  {formatSP(a.inicio, { timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Secao>

      <Secao titulo="Esperando sua decisão" resumo="Rascunhos que o agente preparou. Aprove, edite ou descarte.">
        {rascunhos.length === 0 ? (
          <p className="card text-body text-muted">
            Nenhum rascunho esperando. Peça um orçamento ou uma mensagem ao{" "}
            <Link href="/painel/agente" className="font-medium text-brand-600 hover:underline">
              agente
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {rascunhos.slice(0, MAX_RASCUNHOS).map((r) => (
                <Cartao key={`${r.tipo}-${r.id}`} cartao={{ tipo: r.tipo, id: r.id }} />
              ))}
            </div>
            {rascunhos.length > MAX_RASCUNHOS && (
              <p className="text-body-sm text-muted">
                E mais {rascunhos.length - MAX_RASCUNHOS} em{" "}
                <Link href="/painel/documentos" className="font-medium text-brand-600 hover:underline">
                  Documentos
                </Link>{" "}
                e{" "}
                <Link href="/painel/mensagens" className="font-medium text-brand-600 hover:underline">
                  Mensagens
                </Link>
                .
              </p>
            )}
          </>
        )}
      </Secao>

      <Secao titulo="Propostas paradas" resumo="Orçamentos enviados há 3 dias ou mais, sem resposta do cliente.">
        <Pendencias propostas={propostas} />
      </Secao>
    </div>
  );
}

function Secao({ titulo, resumo, children }: { titulo: string; resumo?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-title-card font-semibold">{titulo}</h2>
        {resumo && <p className="mt-1 text-body-sm text-muted">{resumo}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * Relógio do servidor para quem renderiza. Fica numa função à parte porque
 * componente tem que ser puro (react-hooks/purity): a página é dinâmica, então
 * "agora" é o instante da requisição, uma vez só.
 */
function requestNow(): number {
  return Date.now();
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora de São Paulo (o servidor roda em UTC). */
function greeting(now: number): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}

/** Primeiro nome do usuário do painel, para a saudação. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
