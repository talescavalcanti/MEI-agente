/**
 * Lógica pura do calendário da Agenda: dias da grade (mês e semana), navegação
 * e agrupamento dos agendamentos por dia de São Paulo. Sem banco nem React,
 * para testar em `tests/telas/agenda-calendario.test.ts`.
 *
 * Datas de calendário são "AAAA-MM-DD" e meses "AAAA-MM"; a conta é feita ao
 * meio-dia UTC (via `addDaysYmd`), longe de qualquer virada de fuso.
 */
import type { AgendaItem, ServicoStatus } from "@/lib/dominio/tipos";
import { addDaysYmd, wallSP, ymdSP } from "@/lib/tz";

export type Visao = "mes" | "semana";

export type DiaGrade = {
  ymd: string;
  /** Dia do mês (1 a 31). */
  dia: number;
  /** 0 = domingo … 6 = sábado. */
  semana: number;
  /** Pertence ao mês exibido (na visão semana, sempre true). */
  doMes: boolean;
  fimDeSemana: boolean;
};

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM" válido, ou null. */
export function mesValido(s: string | null | undefined): string | null {
  return s && MES.test(s) ? s : null;
}

/** "AAAA-MM-DD" que existe no calendário (nada de 2026-02-31), ou null. */
export function diaValido(s: string | null | undefined): string | null {
  if (!s || !DIA.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** Dia da semana de uma data de calendário (0 = domingo). */
export function diaDaSemana(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** Mês ("AAAA-MM") de uma data. */
export const mesDe = (ymd: string) => ymd.slice(0, 7);

/** Mês somado de n (n negativo volta), atravessando a virada de ano. */
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Domingo da semana que contém o dia. */
export function inicioDaSemana(ymd: string): string {
  return addDaysYmd(ymd, -diaDaSemana(ymd));
}

function diaGrade(ymd: string, mes: string | null): DiaGrade {
  const semana = diaDaSemana(ymd);
  return {
    ymd,
    dia: Number(ymd.slice(8, 10)),
    semana,
    doMes: mes == null || mesDe(ymd) === mes,
    fimDeSemana: semana === 0 || semana === 6,
  };
}

/**
 * Grade do mês: sempre 6 semanas (42 dias), de domingo a sábado, começando no
 * domingo do dia 1º (ou no próprio dia 1º, se for domingo).
 */
export function gradeMes(mes: string): DiaGrade[] {
  const inicio = inicioDaSemana(`${mes}-01`);
  return Array.from({ length: 42 }, (_, i) => diaGrade(addDaysYmd(inicio, i), mes));
}

/** Os 7 dias (domingo a sábado) da semana que contém o dia. */
export function gradeSemana(dia: string): DiaGrade[] {
  const inicio = inicioDaSemana(dia);
  return Array.from({ length: 7 }, (_, i) => diaGrade(addDaysYmd(inicio, i), null));
}

/** Intervalo exato da grade, para `agenda_listar(p_de, p_ate)`. */
export function intervalo(grade: DiaGrade[]): { de: string; ate: string } {
  return { de: grade[0].ymd, ate: grade[grade.length - 1].ymd };
}

/** Agendamentos agrupados pelo dia de São Paulo, em ordem de horário. */
export function agruparPorDia<T extends Pick<AgendaItem, "inicio">>(itens: T[]): Map<string, T[]> {
  const ordenados = [...itens].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const porDia = new Map<string, T[]>();
  for (const it of ordenados) {
    const dia = ymdSP(new Date(it.inicio));
    const lista = porDia.get(dia);
    if (lista) lista.push(it);
    else porDia.set(dia, [it]);
  }
  return porDia;
}

/** "HH:mm" em São Paulo. */
export function horaSP(iso: string): string {
  return wallSP(new Date(iso)).hhmm;
}

/**
 * Dia aberto na lista da visão mês: o `?dia` pedido, se for do mês; senão hoje,
 * se hoje for do mês; senão o primeiro dia do mês com agendamento; senão o 1º.
 */
export function diaSelecionado(
  mes: string,
  pedido: string | null,
  hoje: string,
  porDia: Map<string, unknown[]>,
): string {
  if (pedido && mesDe(pedido) === mes) return pedido;
  if (mesDe(hoje) === mes) return hoje;
  const comAgenda = [...porDia.keys()].filter((d) => mesDe(d) === mes).sort()[0];
  return comAgenda ?? `${mes}-01`;
}

/**
 * Lê os searchParams (`?visao`, `?mes`, `?dia`). Na semana, sem `?dia` vale
 * hoje. No mês, sem `?mes` vale o mês do `?dia` ou o de hoje.
 */
export function lerNavegacao(
  params: { visao?: string; mes?: string; dia?: string },
  hoje: string,
): { visao: Visao; mes: string; pedido: string | null } {
  const visao: Visao = params.visao === "semana" ? "semana" : "mes";
  const pedido = diaValido(params.dia);
  const mes = mesValido(params.mes) ?? mesDe(pedido ?? hoje);
  return { visao, mes, pedido };
}

const BASE = "/painel/agenda";

/** URL da visão mês. */
export function hrefMes(mes: string, dia?: string): string {
  return dia ? `${BASE}?mes=${mes}&dia=${dia}` : `${BASE}?mes=${mes}`;
}

/** URL da visão semana. */
export function hrefSemana(dia: string): string {
  return `${BASE}?visao=semana&dia=${dia}`;
}

/** "novembro de 2026". */
export function tituloMes(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mes}-01T12:00:00Z`),
  );
}

/** "15 a 21 de novembro de 2026", "29 de novembro a 5 de dezembro de 2026"… */
export function tituloSemana(dia: string): string {
  const [ini, , , , , , fim] = gradeSemana(dia).map((d) => d.ymd);
  const f = (ymd: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
  const anoFim = f(fim, { day: "numeric", month: "long", year: "numeric" });
  if (ini.slice(0, 4) !== fim.slice(0, 4)) return `${f(ini, { day: "numeric", month: "long", year: "numeric" })} a ${anoFim}`;
  if (mesDe(ini) !== mesDe(fim)) return `${f(ini, { day: "numeric", month: "long" })} a ${anoFim}`;
  return `${Number(ini.slice(8))} a ${anoFim}`;
}

/** "sexta-feira, 20 de novembro". */
export function tituloDia(ymd: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

/** Cabeçalho da grade, de domingo a sábado. */
export const DIAS_SEMANA = [
  { curto: "Dom", longo: "domingo" },
  { curto: "Seg", longo: "segunda-feira" },
  { curto: "Ter", longo: "terça-feira" },
  { curto: "Qua", longo: "quarta-feira" },
  { curto: "Qui", longo: "quinta-feira" },
  { curto: "Sex", longo: "sexta-feira" },
  { curto: "Sáb", longo: "sábado" },
] as const;

/** Cor por status do serviço (fundo do pontinho e borda do item) e legenda. */
export type CorStatus = { rotulo: string; ponto: string; borda: string };

const OUTRO: CorStatus = { rotulo: "Outro", ponto: "bg-slate-400", borda: "border-slate-400" };

export const CORES_STATUS: Partial<Record<ServicoStatus, CorStatus>> = {
  confirmado: { rotulo: "Confirmado", ponto: "bg-sky-500", borda: "border-sky-500" },
  agendado: { rotulo: "Agendado", ponto: "bg-brand-500", borda: "border-brand-500" },
  executado: { rotulo: "Executado", ponto: "bg-amber-500", borda: "border-amber-500" },
  pago: { rotulo: "Pago", ponto: "bg-emerald-500", borda: "border-emerald-500" },
};

export function corStatus(status: ServicoStatus): CorStatus {
  return CORES_STATUS[status] ?? OUTRO;
}

/** Legenda: os status com cor própria e "Outro". */
export const LEGENDA: CorStatus[] = [...Object.values(CORES_STATUS), OUTRO] as CorStatus[];

/** `https://wa.me/55<dígitos>` (whatsapp gravado com DDD, sem 55). Sem número válido → null. */
export function linkWhatsApp(whatsapp: string | null | undefined): string | null {
  let d = (whatsapp ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return `https://wa.me/55${d}`;
}
