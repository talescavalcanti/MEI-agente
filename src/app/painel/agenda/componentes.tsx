import Link from "next/link";
import type { AgendaItem } from "@/lib/dominio/tipos";
import {
  corStatus,
  DIAS_SEMANA,
  horaSP,
  hrefMes,
  LEGENDA,
  linkWhatsApp,
  mesDe,
  tituloDia,
  type DiaGrade,
} from "./calendario";

/* Peças do calendário da Agenda. Sem "use client": tudo é link, o estado mora
   nos searchParams (?visao, ?mes, ?dia). */

const numero = (n: number) => `#${String(n).padStart(3, "0")}`;

const plural = (n: number) => (n === 1 ? "1 agendamento" : `${n} agendamentos`);

/** "‹ anterior · Hoje · próximo ›" */
export function Navegacao({
  titulo,
  anterior,
  hoje,
  proximo,
  unidade,
}: {
  titulo: string;
  anterior: string;
  hoje: string;
  proximo: string;
  unidade: "mês" | "semana";
}) {
  const botao =
    "rounded-field px-3 py-1.5 text-body-sm font-medium text-slate-700 transition-colors hover:bg-tonal-blue hover:text-slate-900";
  const proxRotulo = unidade === "mês" ? "Próximo mês" : "Próxima semana";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-title-card first-letter:uppercase">{titulo}</h2>
      <nav aria-label={`Navegar por ${unidade}`} className="flex items-center gap-1">
        <Link href={anterior} className={botao} aria-label={unidade === "mês" ? "Mês anterior" : "Semana anterior"}>
          ‹ anterior
        </Link>
        <span aria-hidden className="text-muted">·</span>
        <Link href={hoje} className={botao}>
          Hoje
        </Link>
        <span aria-hidden className="text-muted">·</span>
        <Link href={proximo} className={botao} aria-label={proxRotulo}>
          {unidade === "mês" ? "próximo" : "próxima"} ›
        </Link>
      </nav>
    </div>
  );
}

export function Legenda() {
  return (
    <ul aria-label="Legenda de cores por estado do serviço" className="flex flex-wrap gap-x-4 gap-y-1">
      {LEGENDA.map((c) => (
        <li key={c.rotulo} className="flex items-center gap-1.5 text-caption text-muted">
          <span aria-hidden className={`size-2 rounded-full ${c.ponto}`} />
          {c.rotulo}
        </li>
      ))}
    </ul>
  );
}

/**
 * Grade do mês, 6 × 7. No celular cada dia mostra só o número e pontinhos (um
 * por agendamento, até 3); a partir de `sm`, até 3 agendamentos e "+N".
 */
export function GradeMes({
  grade,
  porDia,
  hoje,
  selecionado,
}: {
  grade: DiaGrade[];
  porDia: Map<string, AgendaItem[]>;
  hoje: string;
  selecionado: string;
}) {
  return (
    <div className="overflow-hidden rounded-field border border-line">
      <div aria-hidden className="grid grid-cols-7 border-b border-line bg-tonal">
        {DIAS_SEMANA.map((d) => (
          <span key={d.curto} className="py-1.5 text-center text-caption font-semibold text-muted-on-tint">
            {d.curto}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-px bg-line">
        {grade.map((d) => {
          const itens = porDia.get(d.ymd) ?? [];
          const ehHoje = d.ymd === hoje;
          const ehSel = d.ymd === selecionado;
          const rotulo = `${tituloDia(d.ymd)}${ehHoje ? ", hoje" : ""}: ${itens.length ? plural(itens.length) : "sem agendamentos"}`;
          return (
            <li key={d.ymd} className="min-w-0">
              <Link
                href={hrefMes(mesDe(d.ymd), d.ymd)}
                aria-label={rotulo}
                aria-current={ehSel ? "true" : undefined}
                className={`flex h-full min-h-12 flex-col items-center gap-1 p-1 transition-colors hover:bg-tonal-blue sm:min-h-28 sm:items-stretch sm:p-1.5 ${
                  d.fimDeSemana ? "bg-tonal" : "bg-surface"
                } ${ehSel ? "relative z-10 ring-2 ring-inset ring-brand-500" : ""}`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold tabular-nums ${
                    ehHoje ? "bg-brand-500 text-white" : d.doMes ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {d.dia}
                </span>
                {itens.length > 0 && (
                  <>
                    <span aria-hidden className={`flex items-center gap-0.5 sm:hidden ${d.doMes ? "" : "opacity-50"}`}>
                      {itens.slice(0, 3).map((it) => (
                        <span key={it.id} className={`size-1.5 rounded-full ${corStatus(it.status).ponto}`} />
                      ))}
                      {itens.length > 3 && <span className="text-[0.625rem] leading-none text-muted">+</span>}
                    </span>
                    <ul aria-hidden className={`hidden min-w-0 space-y-0.5 sm:block ${d.doMes ? "" : "opacity-50"}`}>
                      {itens.slice(0, 3).map((it) => (
                        <li
                          key={it.id}
                          className={`truncate border-l-2 pl-1 text-caption text-slate-700 ${corStatus(it.status).borda}`}
                        >
                          <span className="font-semibold tabular-nums">{horaSP(it.inicio)}</span> {it.cliente_nome}
                        </li>
                      ))}
                      {itens.length > 3 && <li className="pl-1 text-caption font-medium text-muted">+{itens.length - 3}</li>}
                    </ul>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Um agendamento: horário, #número · descrição, cliente, local e WhatsApp. */
export function ItemAgenda({ item }: { item: AgendaItem }) {
  const cor = corStatus(item.status);
  const whats = linkWhatsApp(item.cliente_whatsapp);
  return (
    <li className={`flex gap-3 border-l-4 py-1 pl-3 ${cor.borda}`}>
      <time dateTime={item.inicio} className="w-11 shrink-0 text-body-sm font-semibold tabular-nums text-brand-600">
        {horaSP(item.inicio)}
      </time>
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-body-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
          {numero(item.numero)} · {item.descricao}
        </h3>
        <p className="text-body-sm text-slate-700">
          {item.cliente_nome}
          {cor.rotulo !== "Outro" && <span className="text-caption text-muted"> · {cor.rotulo}</span>}
        </p>
        <p className="text-caption text-muted [overflow-wrap:anywhere]">{item.local ?? "Local não informado"}</p>
        {whats && (
          <a
            href={whats}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp de ${item.cliente_nome}`}
            className="inline-block text-caption font-medium text-brand-600 underline-offset-2 hover:underline"
          >
            WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}

/** Lista do dia selecionado na visão mês. */
export function ListaDia({ dia, itens, hoje }: { dia: string; itens: AgendaItem[]; hoje: string }) {
  return (
    <section aria-labelledby="dia-selecionado" className="card space-y-4">
      <div>
        {dia === hoje && <p className="eyebrow">Hoje</p>}
        <h2 id="dia-selecionado" className="text-title-card first-letter:uppercase">
          {tituloDia(dia)}
        </h2>
        <p className="mt-1 text-caption text-muted">{itens.length ? plural(itens.length) : "Nenhum agendamento neste dia."}</p>
      </div>
      {itens.length > 0 && (
        <ol className="space-y-3">
          {itens.map((it) => (
            <ItemAgenda key={it.id} item={it} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Visão semana: 7 colunas a partir de `xl`; abaixo disso, lista por dia (dia
 * sem agendamento vira uma linha curta).
 */
export function Semana({
  grade,
  porDia,
  hoje,
}: {
  grade: DiaGrade[];
  porDia: Map<string, AgendaItem[]>;
  hoje: string;
}) {
  return (
    <ol className="grid gap-3 xl:grid-cols-7 xl:gap-2">
      {grade.map((d) => {
        const itens = porDia.get(d.ymd) ?? [];
        const ehHoje = d.ymd === hoje;
        return (
          <li
            key={d.ymd}
            aria-current={ehHoje ? "date" : undefined}
            className={`min-w-0 rounded-field border p-3 xl:min-h-48 ${
              ehHoje ? "border-brand-500" : "border-line"
            } ${d.fimDeSemana ? "bg-tonal" : "bg-surface"}`}
          >
            <h2 className="flex items-baseline gap-2 xl:flex-col xl:gap-0">
              <span className="text-caption font-semibold uppercase tracking-wide text-muted-on-tint">
                {DIAS_SEMANA[d.semana].curto}
                <span className="sr-only"> ({DIAS_SEMANA[d.semana].longo})</span>
              </span>
              <span className={`text-title-card tabular-nums ${ehHoje ? "text-brand-600" : "text-slate-900"}`}>
                {d.dia}
                <span className="sr-only">
                  {" "}
                  de {new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${d.ymd}T12:00:00Z`))}
                  {ehHoje ? ", hoje" : ""}
                </span>
              </span>
            </h2>
            {itens.length ? (
              <ol className="mt-3 space-y-3">
                {itens.map((it) => (
                  <ItemAgenda key={it.id} item={it} />
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-caption text-muted xl:mt-3">Livre</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
