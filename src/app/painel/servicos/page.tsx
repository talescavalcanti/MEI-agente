import type { Metadata } from "next";
import Link from "next/link";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { ServicoListado, ServicoStatus } from "@/lib/dominio/tipos";
import { formatSP } from "@/lib/tz";
import Segmented from "@/app/components/Segmented";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";

export const metadata: Metadata = { title: "Serviços" };
const estados: { key: "todos" | ServicoStatus; label: string }[] = [
  { key: "todos", label: "Todos" }, { key: "rascunho", label: "Rascunhos" },
  { key: "orcado", label: "Orçados" }, { key: "aguardando_resposta", label: "Aguardando" },
  { key: "confirmado", label: "Confirmados" }, { key: "agendado", label: "Agendados" },
  { key: "executado", label: "Executados" }, { key: "pago", label: "Pagos" },
  { key: "cancelado", label: "Cancelados" },
];

export default async function Servicos({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { mei } = await requireMei();
  const pedido = (await searchParams).estado;
  const estado = estados.find(e => e.key === pedido)?.key ?? "todos";
  const servicos = await rpcDb("servico_listar", { p_mei: mei.id, p_status: estado === "todos" ? null : estado }) as ServicoListado[];
  const filtro = <div className="max-w-full overflow-x-auto"><Segmented label="Filtrar serviços por estado" items={estados.map(e => ({ ...e, href: e.key === "todos" ? "/painel/servicos" : `/painel/servicos?estado=${e.key}` }))} current={estado} /></div>;
  if (!servicos.length && estado === "todos") return <EmptyModule section="Serviços" title="Serviços" summary="Nenhum serviço ainda. Conte o primeiro trabalho ao agente para começar." phase={null} phaseNote="Os serviços cadastrados aparecerão aqui." items={["Estado e valor dos serviços", "Cliente e data prevista"]} />;
  return <div className="space-y-6">
    <PageHeader section="Serviços" title="Serviços" summary="Acompanhe seus trabalhos e o que falta concluir." actions={<Link className="text-link text-brand-600" href="/painel/agente">Falar com o agente</Link>} />
    {filtro}
    {!servicos.length ? <p className="card text-body text-muted">Nenhum serviço neste estado.</p> : <ul className="grid gap-4 md:grid-cols-2">
      {servicos.map(s => <li key={s.id} className="card space-y-3">
        <div className="flex justify-between gap-3"><h2 className="text-title-card">#{String(s.numero).padStart(3, "0")} · {s.descricao}</h2><span className="text-caption text-brand-600">{estados.find(e => e.key === s.status)?.label ?? s.status}</span></div>
        <p className="text-body-sm text-slate-700">{s.cliente_nome}</p>
        <p className="text-body-sm text-muted">{s.valor == null ? "Valor não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.valor)} · {s.data_prevista ? formatSP(`${s.data_prevista}T12:00:00Z`, { dateStyle: "short" }) : "Sem data prevista"}</p>
      </li>)}
    </ul>}
  </div>;
}
