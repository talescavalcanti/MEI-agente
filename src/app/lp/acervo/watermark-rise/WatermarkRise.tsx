"use client";
// WatermarkRise: letras gigantes que sobem de baixo (slideInFromBottom 1.4s, expo out),
// com +0.05s de atraso por letra. Dispara quando o elemento entra na viewport.
import { useEffect, useImperativeHandle, useRef } from "react";
import type { HTMLAttributes, Ref } from "react";
import { cx } from "../kit/cx";
import "./watermark-rise.css";

export type WatermarkHandle = { play(): void; reset(): void };

export type WatermarkRiseProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  text: string;
  /** Atraso entre letras (s). */
  stagger?: number;
  /** "view" dispara ao entrar na viewport; "manual" só via ref.play(). */
  trigger?: "view" | "manual";
  /** threshold do IntersectionObserver. */
  threshold?: number;
  ref?: Ref<WatermarkHandle>;
};

export function WatermarkRise({ text, stagger = 0.05, trigger = "view", threshold = 0.2, className, ref, ...rest }: WatermarkRiseProps) {
  const elRef = useRef<HTMLDivElement>(null);

  // A classe .is-animated é ligada direto no DOM: o reset precisa tirar, forçar reflow e religar
  // no mesmo frame para reiniciar as animações CSS.
  useImperativeHandle(ref, () => ({
    play: () => elRef.current?.classList.add("is-animated"),
    reset() {
      const el = elRef.current;
      if (!el) return;
      el.classList.remove("is-animated");
      void el.offsetWidth;
    },
  }));

  useEffect(() => {
    const el = elRef.current;
    if (!el || trigger !== "view") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.classList.add("is-animated");
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [trigger, threshold]);

  return (
    <div ref={elRef} className={cx("watermark", className)} aria-label={text} role="img" {...rest}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${(stagger * i).toFixed(2)}s` }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </div>
  );
}
