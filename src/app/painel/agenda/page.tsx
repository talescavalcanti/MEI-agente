import type { Metadata } from "next";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { AgendaItem } from "@/lib/dominio/tipos";
import { addDaysYmd, ymdSP } from "@/lib/tz";
import Segmented from "@/app/components/Segmented";
import PageHeader from "../PageHeader";
import {
  agruparPorDia,
  diaSelecionado,
  gradeMes,
  gradeSemana,
  hrefMes,
  hrefSemana,
  intervalo,
  lerNavegacao,
  mesDe,
  somarMes,
  tituloMes,
  tituloSemana,
} from "./calendario";
import { GradeMes, Legenda, ListaDia, Navegacao, Semana } from "./componentes";

export const metadata: Metadata = { title: "Agenda" };

type Params = { visao?: string; mes?: string; dia?: string };

export default async function Agenda({ searchParams }: { searchParams: Promise<Params> }) {
  const { mei } = await requireMei();
  const hoje = ymdSP(new Date());
  const { visao, mes, pedido } = lerNavegacao(await searchParams, hoje);

  // Semana: o dia pedido (ou hoje). Mês: a grade de 6 semanas do mês.
  const diaSemana = pedido ?? hoje;
  const grade = visao === "semana" ? gradeSemana(diaSemana) : gradeMes(mes);
  const { de, ate } = intervalo(grade);
  const agenda = (await rpcDb("agenda_listar", { p_mei: mei.id, p_de: de, p_ate: ate })) as AgendaItem[];
  const porDia = agruparPorDia(agenda);

  const selecionado = visao === "semana" ? diaSemana : diaSelecionado(mes, pedido, hoje, porDia);
  const seletor = (
    <Segmented
      label="Visão da agenda"
      current={visao}
      items={[
        { key: "mes", label: "Mês", href: hrefMes(mesDe(selecionado), selecionado) },
        { key: "semana", label: "Semana", href: hrefSemana(selecionado) },
      ]}
    />
  );

  const noPeriodo =
    visao === "semana" ? agenda.length : agenda.filter((a) => mesDe(ymdSP(new Date(a.inicio))) === mes).length;

  return (
    <div className="space-y-6">
      <PageHeader
        section="Agenda"
        title="Agenda"
        summary="Seus serviços agendados, no horário de São Paulo."
        actions={seletor}
      />

      {visao === "semana" ? (
        <section aria-label="Semana" className="card space-y-4">
          <Navegacao
            unidade="semana"
            titulo={tituloSemana(diaSemana)}
            anterior={hrefSemana(addDaysYmd(diaSemana, -7))}
            hoje={hrefSemana(hoje)}
            proximo={hrefSemana(addDaysYmd(diaSemana, 7))}
          />
          {!noPeriodo && <p className="text-body-sm text-muted">Nenhum agendamento nesta semana.</p>}
          <Semana grade={grade} porDia={porDia} hoje={hoje} />
          <Legenda />
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <section aria-label="Calendário do mês" className="card space-y-4 max-sm:px-3">
            <Navegacao
              unidade="mês"
              titulo={tituloMes(mes)}
              anterior={hrefMes(somarMes(mes, -1))}
              hoje={hrefMes(mesDe(hoje))}
              proximo={hrefMes(somarMes(mes, 1))}
            />
            {!noPeriodo && <p className="text-body-sm text-muted">Nenhum agendamento neste mês.</p>}
            <GradeMes grade={grade} porDia={porDia} hoje={hoje} selecionado={selecionado} />
            <Legenda />
          </section>
          <ListaDia dia={selecionado} itens={porDia.get(selecionado) ?? []} hoje={hoje} />
        </div>
      )}
    </div>
  );
}
