"use client";
// RollerNumber: odômetro. Cada dígito é uma tira de 30 números (0–9 ×3) numa janela de 1em.
// Começa em -10em ("0" da segunda volta) e rola até -(20 + dígito)em, ou seja, sempre dá uma
// volta completa antes de parar. Os dígitos da direita começam primeiro.
import { useImperativeHandle, useRef } from "react";
import type { HTMLAttributes, Ref, RefObject } from "react";
import { ScrollTrigger, gsap, prefersReducedMotion } from "../kit/core";
import { cx } from "../kit/cx";
import { useGsap } from "../kit/useGsap";
import "./roller-number.css";

// Separa prefixo de moeda, número e sufixo: "$50B+" → { prefix: "$", value: 50, suffix: "B+" }
const STAT_RE = /^([€$£¥₹R]*\$?[+]?)(\d+)([MBKx%+]*)$/i;
export function parseStat(text: string) {
  const m = String(text).trim().match(STAT_RE);
  return m ? { prefix: m[1], value: Number(m[2]), suffix: m[3] } : null;
}

export type RollerNumberHandle = { play(delay?: number): void };

export type RollerNumberProps = Omit<HTMLAttributes<HTMLSpanElement>, "children" | "prefix"> & {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Duração de cada tira (s). */
  duration?: number;
  /** Atraso entre dígitos, da direita para a esquerda (s). */
  stagger?: number;
  /** false → só roda via ref.play(). */
  autoplay?: boolean;
  /** Elemento observado pelo ScrollTrigger (padrão: o próprio número). */
  triggerRef?: RefObject<Element | null>;
  ref?: Ref<RollerNumberHandle>;
};

const NUMS = Array.from({ length: 30 }, (_, i) => i % 10);

export function RollerNumber({
  value,
  prefix = "",
  suffix = "",
  duration = 2,
  stagger = 0.1,
  autoplay = true,
  triggerRef,
  className,
  ref,
  ...rest
}: RollerNumberProps) {
  const elRef = useRef<HTMLSpanElement>(null);
  const digits = Math.round(value).toString().split("").map(Number);

  const api = useRef<RollerNumberHandle | null>(null);

  useGsap(
    (ctx) => {
      const el = elRef.current;
      if (!el) return;
      const strips = el.querySelectorAll<HTMLElement>(".roller__strip");
      const play = (delay = 0) =>
        ctx.add(() => {
          strips.forEach((strip, i) => {
            const d = digits[i] ?? 0;
            if (prefersReducedMotion()) return void gsap.set(strip, { y: `${-20 - d}em` });
            gsap.fromTo(
              strip,
              { y: "-10em" },
              { y: `${-20 - d}em`, duration, delay: delay + (digits.length - 1 - i) * stagger, ease: "expo.inOut", overwrite: true },
            );
          });
        });
      api.current = { play };
      if (autoplay) {
        ScrollTrigger.create({
          trigger: triggerRef?.current ?? el,
          start: "top bottom",
          once: true,
          invalidateOnRefresh: true,
          onEnter: () => play(),
        });
      }
      return () => {
        api.current = null;
      };
    },
    [value, autoplay, duration, stagger],
    elRef,
  );

  useImperativeHandle(ref, () => ({ play: (delay?: number) => api.current?.play(delay) }), []);

  return (
    <span ref={elRef} className={cx("roller", className)} role="img" aria-label={`${prefix}${value}${suffix}`} {...rest}>
      {prefix && (
        <span className="roller__affix" aria-hidden="true">
          {prefix}
        </span>
      )}
      {digits.map((_, i) => (
        <span key={i} className="roller__digit" aria-hidden="true">
          <span className="roller__strip">
            {NUMS.map((n, j) => (
              <span key={j}>{n}</span>
            ))}
          </span>
        </span>
      ))}
      {suffix && (
        <span className="roller__affix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  );
}
