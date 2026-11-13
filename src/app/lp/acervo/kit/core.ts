// Núcleo compartilhado por todos os componentes: curvas, charset, helpers de ambiente e scroll.
// Os helpers que tocam window só podem rodar no cliente (dentro de efeitos ou handlers).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

// Rampa de luminância: usada pelo scramble e pelo atlas do ASCII.
export const CHARSET = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isTouch = () =>
  "ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia("(hover: none)").matches;
export const canHover = () => window.matchMedia("(hover: hover)").matches;
export const isWide = (min = 768) => window.matchMedia(`(min-width: ${min}px)`).matches;

// Texto aleatório do mesmo comprimento, preservando espaços e quebras de linha.
export function randomize(text: string, chars = CHARSET) {
  let out = "";
  for (const ch of text) {
    out += ch === " " || ch === "\n" || ch === "\r" ? ch : chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export type EaseFn = (x: number) => number;

// cubic-bezier → função de easing que o GSAP aceita.
export function bezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(t);
  };
}

export const easings = {
  power3Out: bezier(0.25, 1, 0.5, 1),
  power3InOut: bezier(0.76, 0, 0.24, 1),
  cubicOut: bezier(0.33, 1, 0.68, 1),
  backOut: bezier(0.34, 1.56, 0.64, 1),
  backInOutSubtle: bezier(0.68, -0.3, 0.32, 1.1),
};

export const easeOutCubic: EaseFn = (t) => 1 - (1 - t) ** 3;

// ---------- Smooth scroll (opcional) ----------
let lenis: Lenis | null = null;

/** Liga o Lenis ao ticker do GSAP. Devolve uma função que desfaz tudo (use no cleanup do efeito). */
export function initSmoothScroll(options: ConstructorParameters<typeof Lenis>[0] = {}) {
  if (lenis || prefersReducedMotion()) return () => {};
  const instance = new Lenis({ anchors: { duration: 1.2, easing: easeOutCubic }, ...options });
  const raf = (time: number) => instance.raf(time * 1000);
  instance.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  lenis = instance;
  return () => {
    gsap.ticker.remove(raf);
    gsap.ticker.lagSmoothing(500, 33);
    instance.destroy();
    if (lenis === instance) lenis = null;
  };
}

export const getLenis = () => lenis;

export function scrollToY(
  y: number,
  { duration = 0.8, easing = easeOutCubic, onComplete }: { duration?: number; easing?: EaseFn; onComplete?: () => void } = {},
) {
  if (lenis) lenis.scrollTo(y, { duration, easing, onComplete: () => onComplete?.() });
  else {
    window.scrollTo({ top: y, behavior: "smooth" });
    window.setTimeout(() => onComplete?.(), duration * 1000);
  }
}

/** Listener de scroll que funciona com ou sem Lenis. Devolve a função de remoção. */
export function onScroll(fn: () => void) {
  if (lenis) return lenis.on("scroll", fn);
  window.addEventListener("scroll", fn, { passive: true });
  return () => window.removeEventListener("scroll", fn);
}
