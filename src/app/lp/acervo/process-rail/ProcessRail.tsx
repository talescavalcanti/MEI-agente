"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { disableKey } from "../kit/anm";
import { cx } from "../kit/cx";
import { escapeHtml } from "../kit/html";
import { createProcessRail, type ProcessRailApi, type ProcessRailOptions } from "./process-rail";
import "./process-rail.css";

export type RailStep = { title: string; text: string; image?: string; media?: ReactNode; num?: string };

export type ProcessRailHandle = { refresh(): void; scrollTo(i: number): void };

export type ProcessRailProps = ProcessRailOptions &
  Omit<HTMLAttributes<HTMLElement>, "children"> & {
    steps: RailStep[];
    /** Conteúdo preso no palco junto com o trilho (título da seção). Acréscimo do MEIagente. */
    head?: ReactNode;
    ref?: Ref<ProcessRailHandle>;
  };

export function ProcessRail({ steps, head, scrub, beadSize, sticky, stagger, disable, className, ref, ...rest }: ProcessRailProps) {
  const root = useRef<HTMLElement>(null);
  const api = useRef<ProcessRailApi | null>(null);
  const stepsKey = JSON.stringify(steps.map((s) => [s.title, s.num, s.image]));
  const off = disableKey(disable);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const inst = createProcessRail(el, { scrub, beadSize, sticky, stagger, disable });
    api.current = inst;
    return () => {
      inst?.kill();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, scrub, beadSize, sticky, stagger, off]);

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => api.current?.refresh(),
      scrollTo: (i) => api.current?.scrollTo(i),
    }),
    [],
  );

  return (
    <section ref={root} className={cx("prl_wrap", className)} data-anm-process-rail="" {...rest}>
      <div className="prl_stage">
        {head}
        <div className="prl_rail" data-anm-prl-rail="">
          <svg className="prl_svg prl_svg_desktop" viewBox="0 0 1200 40" aria-hidden="true" focusable="false">
            <path className="prl_path" data-anm-prl-path="desktop" d="M 20 20 L 1180 20" />
          </svg>
          <svg className="prl_svg prl_svg_mobile" viewBox="0 0 80 560" aria-hidden="true" focusable="false">
            <path className="prl_path" data-anm-prl-path="mobile" d="M 40 16 L 40 544" />
          </svg>
          <span className="prl_bead" data-anm-prl-bead="" />
          <ol className="prl_steps">
            {steps.map((s, i) => (
              <li key={i} className="prl_step" data-anm-prl-step="">
                <button type="button" className="prl_step_btn">
                  {/* O motor troca o número por colunas de dígitos que rolam. */}
                  <span
                    className="prl_step_num"
                    data-anm-prl-num=""
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: escapeHtml(s.num ?? String(i + 1).padStart(2, "0")) }}
                  />
                  <span className="prl_step_title">{s.title}</span>
                  <span className="prl_step_text">{s.text}</span>
                  {(s.media || s.image) && (
                    <span className="prl_step_media" data-anm-prl-media="">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.media ?? <img src={s.image} alt="" loading="lazy" />}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
