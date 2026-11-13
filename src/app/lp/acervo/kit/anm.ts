// Peças comuns dos componentes de markup (os 17 que vinham configurados por data-anm-*).
import { CustomEase } from "gsap/CustomEase";
import { gsap } from "./core";

gsap.registerPlugin(CustomEase);

let eased = false;
/** Registra as curvas nomeadas usadas como `ease` ("softOut", "softInOut"). Idempotente. */
export function registerSoftEases() {
  if (eased) return;
  eased = true;
  CustomEase.create("softOut", "M0,0 C0.3,0.9 0.1,1 1,1");
  CustomEase.create("softInOut", "M0,0 C0.7,0 0.16,1 1,1");
}

/** Breakpoints em que um componente pode ser desligado (prop `disable`). */
export type DisableAt = "mobile" | "tablet" | "landscape" | "desktop";

const BREAKPOINTS: Record<DisableAt, string> = {
  mobile: "(max-width: 479px)",
  tablet: "(max-width: 991px)",
  landscape: "(orientation: landscape) and (max-width: 767px)",
  desktop: "(min-width: 992px)",
};

/** Lista ou chave em texto ("mobile,tablet"), para usar como dependência estável de efeito. */
export const isDisabledAt = (list?: DisableAt[] | string | null) =>
  !!(typeof list === "string" ? (list.split(",").filter(Boolean) as DisableAt[]) : list)?.some(
    (v) => BREAKPOINTS[v] && window.matchMedia(BREAKPOINTS[v]).matches,
  );

/** Chave estável de `disable` para arrays de dependência. */
export const disableKey = (list?: DisableAt[] | null) => list?.join(",") ?? "";

/** Dispara um CustomEvent no elemento (os eventos anm-* das versões vanilla). */
export const emit = (el: Element, name: string, detail?: unknown) => el.dispatchEvent(new CustomEvent(name, { detail }));
