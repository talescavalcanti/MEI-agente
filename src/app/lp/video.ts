/** Lógica pura do player da demonstração (`DemoVideo.tsx`), testada à parte. */

export type AcaoPlayer = "alternar" | "voltar" | "avancar" | "mudo" | "telaCheia";

function segundosInteiros(s: number): number {
  return Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
}

/** 338.6 → "5:38"; a partir de uma hora, "1:02:05". */
export function formatarTempo(s: number): string {
  const total = segundosInteiros(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const seg = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${seg}` : `${m}:${seg}`;
}

/** 338.6 → "5 min 38 s", para `aria-valuetext` e rótulos. */
export function falarTempo(s: number): string {
  const total = segundosInteiros(s);
  const m = Math.floor(total / 60);
  const seg = total % 60;
  if (m === 0) return `${seg} s`;
  return seg === 0 ? `${m} min` : `${m} min ${seg} s`;
}

const TECLAS: Record<string, AcaoPlayer> = {
  " ": "alternar",
  k: "alternar",
  arrowleft: "voltar",
  j: "voltar",
  arrowright: "avancar",
  l: "avancar",
  m: "mudo",
  f: "telaCheia",
};

/** Atalhos de teclado no estilo dos players de vídeo comuns. */
export function acaoDaTecla(tecla: string): AcaoPlayer | null {
  return TECLAS[tecla.toLowerCase()] ?? null;
}
