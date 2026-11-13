import type { Metadata } from "next";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { AgendaItem } from "@/lib/dominio/tipos";
import { addDaysYmd, formatSP, ymdSP } from "@/lib/tz";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";

export const metadata: Metadata = { title: "Agenda" };

export default async function Agenda() {
  const { mei } = await requireMei();
  const hoje = ymdSP(new Date());
  const agenda = await rpcDb("agenda_listar", { p_mei: mei.id, p_de: hoje, p_ate: addDaysYmd(hoje, 30) }) as AgendaItem[];
  if (!agenda.length) return <EmptyModule section="Agenda" title="Agenda" summary="Nenhum serviço agendado para os próximos 30 dias." phase={null} phaseNote="Os agendamentos entram aqui quando você os combinar com o cliente." items={["Data e horário dos próximos serviços", "Local e cliente de cada visita"]} />;
  return <div className="space-y-6">
    <PageHeader section="Agenda" title="Agenda" summary="Próximos 30 dias, no horário de São Paulo." />
    <ol className="space-y-4">{agenda.map(a => <li key={a.id} className="card flex flex-col gap-2 sm:flex-row sm:justify-between">
      <div><h2 className="text-title-card">#{String(a.numero).padStart(3, "0")} · {a.descricao}</h2><p className="mt-1 text-body-sm text-slate-700">{a.cliente_nome}</p><p className="text-body-sm text-muted">{a.local ?? "Local não informado"}</p></div>
      <time className="text-body-sm font-semibold text-brand-600" dateTime={a.inicio}>{formatSP(a.inicio)}</time>
    </li>)}</ol>
  </div>;
}
