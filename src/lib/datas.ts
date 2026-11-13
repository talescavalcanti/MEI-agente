import { addDaysYmd, ymdSP } from "./tz";

/**
 * Datas que vêm aí: feriados nacionais e datas comerciais do Brasil (agenda do
 * MEI, sugestão de post e de campanha). Lista fixa em código (sem API externa): as datas fixas por
 * dia do ano e as móveis calculadas (Páscoa e o que depende dela, e os
 * domingos/sextas de data comercial). Puro, sem banco.
 */

export type DateKind = "feriado" | "ponto facultativo" | "data comercial";
export type SpecialDate = { ymd: string; name: string; kind: DateKind };

const FIXED: Array<{ md: string; name: string; kind: DateKind }> = [
  { md: "01-01", name: "Confraternização Universal", kind: "feriado" },
  { md: "03-08", name: "Dia Internacional da Mulher", kind: "data comercial" },
  { md: "03-15", name: "Dia do Consumidor", kind: "data comercial" },
  { md: "04-21", name: "Tiradentes", kind: "feriado" },
  { md: "05-01", name: "Dia do Trabalho", kind: "feriado" },
  { md: "06-12", name: "Dia dos Namorados", kind: "data comercial" },
  { md: "09-07", name: "Independência do Brasil", kind: "feriado" },
  { md: "09-15", name: "Dia do Cliente", kind: "data comercial" },
  { md: "10-12", name: "Nossa Senhora Aparecida e Dia das Crianças", kind: "feriado" },
  { md: "10-15", name: "Dia do Professor", kind: "data comercial" },
  { md: "11-02", name: "Finados", kind: "feriado" },
  { md: "11-15", name: "Proclamação da República", kind: "feriado" },
  // Feriado nacional desde a Lei 14.759/2023.
  { md: "11-20", name: "Dia da Consciência Negra", kind: "feriado" },
  { md: "12-24", name: "Véspera de Natal", kind: "data comercial" },
  { md: "12-25", name: "Natal", kind: "feriado" },
  { md: "12-31", name: "Véspera de Ano Novo", kind: "data comercial" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Dia da semana (0 = domingo) de um "YYYY-MM-DD". */
const dow = (s: string) => new Date(`${s}T12:00:00Z`).getUTCDay();

/** N-ésimo dia da semana `wd` do mês (ex.: 2º domingo de maio). */
function nthWeekday(year: number, month: number, wd: number, nth: number): string {
  let s = ymd(year, month, 1);
  while (dow(s) !== wd) s = addDaysYmd(s, 1);
  return addDaysYmd(s, 7 * (nth - 1));
}

export function datesOfYear(year: number): SpecialDate[] {
  const p = easter(year);
  const blackFriday = addDaysYmd(nthWeekday(year, 11, 4, 4), 1); // sexta depois da 4ª quinta
  const list: SpecialDate[] = [
    ...FIXED.map((f) => ({ ymd: `${year}-${f.md}`, name: f.name, kind: f.kind })),
    { ymd: addDaysYmd(p, -48), name: "Carnaval", kind: "ponto facultativo" },
    { ymd: addDaysYmd(p, -47), name: "Carnaval", kind: "ponto facultativo" },
    { ymd: addDaysYmd(p, -2), name: "Sexta-feira Santa", kind: "feriado" },
    { ymd: p, name: "Páscoa", kind: "data comercial" },
    { ymd: addDaysYmd(p, 60), name: "Corpus Christi", kind: "ponto facultativo" },
    { ymd: nthWeekday(year, 5, 0, 2), name: "Dia das Mães", kind: "data comercial" },
    { ymd: nthWeekday(year, 8, 0, 2), name: "Dia dos Pais", kind: "data comercial" },
    { ymd: blackFriday, name: "Black Friday", kind: "data comercial" },
    { ymd: addDaysYmd(blackFriday, 3), name: "Cyber Monday", kind: "data comercial" },
  ];
  return list.sort((a, b) => a.ymd.localeCompare(b.ymd));
}

/**
 * As próximas `count` datas a partir de hoje em São Paulo (hoje incluso). Os
 * dois dias de Carnaval viram um item só, para não gastar duas vagas.
 */
export function upcomingDates(now: Date, count = 4): Array<SpecialDate & { inDays: number }> {
  const today = ymdSP(now);
  const y = Number(today.slice(0, 4));
  const all = [...datesOfYear(y), ...datesOfYear(y + 1)].filter((d) => d.ymd >= today);
  const out: Array<SpecialDate & { inDays: number }> = [];
  for (const d of all) {
    if (out.some((o) => o.name === d.name && o.ymd.slice(0, 4) === d.ymd.slice(0, 4))) continue;
    const inDays = Math.round((Date.parse(`${d.ymd}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    out.push({ ...d, inDays });
    if (out.length === count) break;
  }
  return out;
}
