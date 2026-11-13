// Formatação usada nos documentos. Puro e determinístico: nada de relógio,
// e o resultado não depende do fuso do processo.
import { APP_TZ, ymdSP } from "@/lib/tz";

/** O que aparece no lugar de todo dado ausente. */
export const A_PREENCHER = "[A PREENCHER]";

/** Texto com conteúdo, ou `null` (vazio e só espaço contam como ausente). */
export function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Número finito, ou `null`. */
export function numero(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * `800` → `"R$ 800,00"`; `1200.5` → `"R$ 1.200,50"`. Espaço comum (não o
 * inseparável do `Intl`), porque o texto é copiado para o WhatsApp.
 */
export function moeda(valor: number): string {
  if (!Number.isFinite(valor)) throw new RangeError(`valor inválido: ${valor}`);
  const centavos = Math.round(Math.abs(valor) * 100);
  const inteiro = Math.floor(centavos / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cent = String(centavos % 100).padStart(2, "0");
  return `${valor < 0 && centavos > 0 ? "-" : ""}R$ ${inteiro},${cent}`;
}

/** `moeda`, ou `[A PREENCHER]` quando não há valor. */
export function moedaOu(valor: number | null | undefined): string {
  const v = numero(valor);
  return v === null ? A_PREENCHER : moeda(v);
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `"2026-11-20"` → `"sexta-feira, 20 de novembro de 2026"`. Data pura é dia
 * de calendário; instante ISO (`"2026-11-21T01:00:00Z"`) vale o dia de São Paulo.
 */
export function dataExtenso(iso: string): string {
  let ymd: string;
  if (DIA_ISO.test(iso)) {
    ymd = iso;
  } else {
    const d = /^\d{4}-\d{2}-\d{2}T/.test(iso) ? new Date(iso) : new Date(Number.NaN);
    if (Number.isNaN(d.getTime())) throw new RangeError(`data inválida: ${iso}`);
    ymd = ymdSP(d);
  }
  // Meio-dia UTC cai no mesmo dia em São Paulo; e confere que o dia existe.
  const meioDia = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(meioDia.getTime()) || meioDia.toISOString().slice(0, 10) !== ymd) {
    throw new RangeError(`data inválida: ${iso}`);
  }
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(meioDia);
  const p = (t: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("weekday")}, ${p("day")} de ${p("month")} de ${p("year")}`;
}

/** `dataExtenso`, ou `[A PREENCHER]` quando não há data. */
export function dataExtensoOu(iso: string | null | undefined): string {
  const t = texto(iso);
  return t === null ? A_PREENCHER : dataExtenso(t);
}

/**
 * `"62999990000"` → `"(62) 99999-0000"`. Aceita número pontuado e com o 55 do
 * país. O que não parece telefone brasileiro volta como veio.
 */
export function telefone(digitos: string): string {
  let d = digitos.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
  if (d.length === 8 || d.length === 9) return `${d.slice(0, -4)}-${d.slice(-4)}`;
  return digitos;
}

/** `telefone`, ou `[A PREENCHER]` quando não há número. */
export function telefoneOu(digitos: string | null | undefined): string {
  const t = texto(digitos);
  return t === null ? A_PREENCHER : telefone(t);
}
