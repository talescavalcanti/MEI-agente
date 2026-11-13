"use client";
// Reveal Accordion: altura animada, ícone que gira e texto revelado linha a linha (SplitText).
// Cada item tem uma timeline pausada (height 0 → auto, ícone gira, traço vertical some) que faz
// play()/reverse(); ao abrir, o texto é dividido em linhas mascaradas que sobem em cascata.
import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { HTMLAttributes, Ref } from "react";
import { SplitText } from "gsap/SplitText";
import { gsap, prefersReducedMotion } from "../kit/core";
import { disableKey, isDisabledAt, type DisableAt } from "../kit/anm";
import { cx } from "../kit/cx";
import { fontsReady } from "../kit/fonts";
import { escapeHtml } from "../kit/html";
import { useGsap } from "../kit/useGsap";
import { useLatest } from "../kit/useLatest";
import "./reveal-accordion.css";

gsap.registerPlugin(SplitText);

export type RevealAccordionItem = { title: string; text: string };

export type RevealAccordionHandle = { open(i: number): void; close(i: number): void; toggle(i: number): void; closeAll(): void };

export type RevealAccordionProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  items: RevealAccordionItem[];
  allowMultiple?: boolean;
  /** Índices abertos na montagem. */
  defaultOpen?: number[];
  duration?: number;
  ease?: string;
  /** "rotate" gira o ícone, "fade" some o traço vertical, "both" faz os dois. */
  iconMode?: "rotate" | "fade" | "both";
  iconRotation?: number;
  /** Revela o texto linha a linha ao abrir. */
  staggerText?: boolean;
  staggerDuration?: number;
  staggerDelay?: number;
  staggerEase?: string;
  staggerYPercent?: number;
  /** Atraso (ms) entre começar a abrir e revelar o texto. */
  staggerStartDelay?: number;
  disable?: DisableAt[];
  onOpen?: (i: number) => void;
  onClose?: (i: number) => void;
  ref?: Ref<RevealAccordionHandle>;
};

const Icon = () => (
  <svg data-anm-accordion-icon="" className="accordion_icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path data-anm-accordion-icon-vertical="" d="M8 1V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path data-anm-accordion-icon-horizontal="" d="M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type Runtime = { tl: gsap.core.Timeline | null; split: SplitText | null; textTl: gsap.core.Timeline | null; timer: number };

export function RevealAccordion({
  items,
  allowMultiple = false,
  defaultOpen = [],
  duration = 0.5,
  ease = "expo.inOut",
  iconMode = "both",
  iconRotation = -180,
  staggerText = true,
  staggerDuration = 0.4,
  staggerDelay = 0.08,
  staggerEase = "expo.out",
  staggerYPercent = 110,
  staggerStartDelay = 200,
  disable,
  onOpen,
  onClose,
  className,
  ref,
  ...rest
}: RevealAccordionProps) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<boolean[]>(() => items.map((_, i) => defaultOpen.includes(i)));
  const shown = useRef<boolean[]>(open);
  const runtime = useRef<Runtime[]>([]);
  const cbs = useLatest({ onOpen, onClose });
  const off = disableKey(disable);

  const set = (i: number, next: boolean) =>
    setOpen((cur) => {
      if (!items[i] || cur[i] === next) return cur;
      return cur.map((v, j) => (j === i ? next : allowMultiple || !next ? v : false));
    });

  // Revela as linhas do texto do item i (SplitText com máscara por linha).
  const revealText = (i: number) => {
    const r = runtime.current[i];
    const p = root.current?.querySelectorAll<HTMLElement>("[data-anm-accordion-content]")[i]?.querySelector("p");
    if (!r || !p || r.split) return;
    r.split = SplitText.create(p, {
      type: "lines",
      mask: "lines",
      linesClass: "accordion_split_line",
      onSplit(instance) {
        gsap.set(instance.lines, { yPercent: staggerYPercent, force3D: true });
        r.textTl = gsap.timeline().to(instance.lines, { yPercent: 0, duration: staggerDuration, stagger: staggerDelay, ease: staggerEase, force3D: true });
      },
    });
  };
  const resetText = (r: Runtime) => {
    clearTimeout(r.timer);
    r.textTl?.kill();
    r.textTl = null;
    r.split?.revert();
    r.split = null;
  };

  // Timelines pausadas, uma por item; itens abertos na montagem começam no fim.
  useGsap(
    () => {
      const el = root.current;
      if (!el) return;
      const animate = !prefersReducedMotion() && !isDisabledAt(off);
      runtime.current = [...el.querySelectorAll<HTMLElement>("[data-anm-accordion-item]")].map((item, i) => {
        const content = item.querySelector("[data-anm-accordion-content]");
        const icon = item.querySelector("[data-anm-accordion-icon]");
        const vertical = icon?.querySelector("[data-anm-accordion-icon-vertical]");
        if (!animate) {
          // Acréscimo do MEIagente: sem animação, o item fechado também precisa começar fechado.
          if (content instanceof HTMLElement) content.style.height = shown.current[i] ? "auto" : "0";
          return { tl: null, split: null, textTl: null, timer: 0 };
        }
        gsap.set(content, { height: 0, overflow: "hidden", force3D: true, willChange: "height" });
        const tl = gsap.timeline({ paused: true, defaults: { duration, ease } });
        tl.to(content, { height: "auto", duration, ease }, 0);
        if (icon && (iconMode === "rotate" || iconMode === "both")) tl.to(icon, { rotation: iconRotation, duration, ease }, 0);
        if (vertical && (iconMode === "fade" || iconMode === "both"))
          tl.to(vertical, { opacity: 0, duration: duration * 0.5, ease: "power2.inOut" }, duration * 0.25);
        if (shown.current[i]) tl.progress(1);
        return { tl, split: null, textTl: null, timer: 0 };
      });
      // Itens já abertos revelam o texto quando a fonte chegar.
      if (animate && staggerText) {
        let alive = true;
        fontsReady().then(() => {
          window.setTimeout(() => {
            if (alive) shown.current.forEach((o, i) => o && revealText(i));
          }, 100);
        });
        return () => {
          alive = false;
          runtime.current.forEach(resetText);
          runtime.current = [];
        };
      }
      return () => {
        runtime.current = [];
      };
    },
    [items.length, duration, ease, iconMode, iconRotation, staggerText, off],
  );

  // Estado → animação. Só os itens que mudaram tocam a timeline.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const contents = el.querySelectorAll<HTMLElement>("[data-anm-accordion-content]");
    open.forEach((isOpen, i) => {
      if (isOpen === shown.current[i]) return;
      const r = runtime.current[i];
      if (isOpen) cbs.current.onOpen?.(i);
      else cbs.current.onClose?.(i);
      contents[i]?.closest("[data-anm-accordion-item]")?.dispatchEvent(
        new CustomEvent(isOpen ? "anm-accordion-open" : "anm-accordion-close", { detail: { index: i }, bubbles: true }),
      );
      if (!r) return;
      if (!r.tl) {
        if (contents[i]) contents[i].style.height = isOpen ? "auto" : "0";
        return;
      }
      if (isOpen) {
        r.tl.play();
        if (staggerText) {
          clearTimeout(r.timer);
          r.timer = window.setTimeout(() => fontsReady().then(() => shown.current[i] && revealText(i)), staggerStartDelay);
        }
      } else {
        r.tl.reverse();
        resetText(r);
      }
    });
    shown.current = open;
    // revealText/resetText leem a config atual; só o estado dispara este efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useImperativeHandle(ref, () => ({
    open: (i) => set(i, true),
    close: (i) => set(i, false),
    toggle: (i) => set(i, !open[i]),
    closeAll: () => setOpen((cur) => cur.map(() => false)),
  }));

  return (
    <div ref={root} className={cx("accordion_section", className)} data-anm-accordion="" {...rest}>
      {items.map((it, i) => {
        const contentId = `${uid}-c${i}`;
        return (
          <div key={i} className="accordion_item" data-anm-accordion-item="">
            <button
              type="button"
              className="accordion_trigger"
              data-anm-accordion-trigger=""
              aria-expanded={!!open[i]}
              aria-controls={contentId}
              onClick={() => set(i, !open[i])}
            >
              <span className="accordion_title">{it.title}</span>
              <Icon />
            </button>
            <div id={contentId} className="accordion_content" data-anm-accordion-content="" aria-hidden={!open[i]}>
              {/* O SplitText reescreve o <p>: conteúdo fora da reconciliação do React. */}
              <p className="accordion_text" dangerouslySetInnerHTML={{ __html: escapeHtml(it.text) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
