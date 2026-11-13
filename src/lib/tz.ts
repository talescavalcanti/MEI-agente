/**
 * O servidor roda em UTC. Toda exibição de horário pro usuário deve usar
 * America/Sao_Paulo, e todo "hoje" também é o dia de São Paulo. Cálculos e
 * armazenamento continuam em UTC.
 *
 * Puro (sem banco nem `server-only`): serve também para rótulo na tela.
 */
export const APP_TZ = "America/Sao_Paulo";

const DAY_MS = 86_400_000;

/** Formata uma data (ISO ou Date) no fuso de São Paulo. Vazio ou inválido vira "-". */
export function formatSP(
  value: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  }
): string {
  if (value == null) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, ...opts }).format(d);
}

/* As funções abaixo vêm do `periodo.ts` do meu-chat: só a parte de calendário,
   sem os recortes de dashboard, que aqui não existem. */

/** "YYYY-MM-DD" do instante no fuso do app. `ymdSP(new Date())` é o "hoje". */
export function ymdSP(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d);
}

/**
 * Meia-noite de um dia de São Paulo, como instante. O deslocamento é lido do
 * próprio Intl para aquele dia, não fixo em -03:00, porque o Brasil já teve
 * horário de verão e pode voltar a ter.
 */
export function midnightSP(ymd: string): Date {
  const probe = new Date(`${ymd}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-03:00"
  // "GMT" sozinho (fuso sem deslocamento) vira "" → "+00:00".
  const offset = name?.replace("GMT", "") || "+00:00";
  return new Date(`${ymd}T00:00:00${offset}`);
}

/** O dia "YYYY-MM-DD" somado de n dias (n negativo volta). Calendário puro. */
export function addDaysYmd(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Data e hora de parede em São Paulo ("2026-11-20", "18:30") → instante.
 * Mesmo cálculo de deslocamento do `midnightSP`. Entrada inválida → null.
 */
export function instantSP(ymd: string, hhmm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const midnight = midnightSP(ymd);
  if (Number.isNaN(midnight.getTime())) return null;
  // O dia existe de verdade? (2026-02-31 viraria 03/03 sem reclamar.)
  if (ymdSP(new Date(midnight.getTime() + 12 * 3_600_000)) !== ymd) return null;
  return new Date(midnight.getTime() + (h * 60 + m) * 60_000);
}

/** Instante → { ymd, hhmm } de parede em São Paulo (para preencher formulário). */
export function wallSP(d: Date): { ymd: string; hhmm: string } {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return { ymd: ymdSP(d), hhmm };
}
