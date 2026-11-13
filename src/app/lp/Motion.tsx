"use client";

import { useLayoutEffect } from "react";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger, gsap, initSmoothScroll, prefersReducedMotion } from "./acervo/kit/core";
import { fontsReady } from "./acervo/kit/fonts";

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Camada de movimento da landing (§6 do LANDING-DESIGN-SYSTEM), num lugar só:
 *
 * - Lenis com os números da §6.4, pelo `initSmoothScroll` do kit do acervo.
 * - `[data-line-reveal]`: linhas mascaradas que sobem de 100% a 0 (§6.5), sem
 *   opacidade, depois de `document.fonts.ready`.
 * - `[data-reveal]`: sobe 42px e aparece (§6.6). `[data-reveal-group]` faz o
 *   mesmo com os filhos diretos, em cascata.
 *
 * Nada fica escondido no HTML do servidor: os elementos só são escondidos aqui,
 * já no cliente, e todos estão abaixo da dobra. Se o JS falhar, a página
 * continua inteira. Com `prefers-reduced-motion`, nada disso roda.
 */
export default function Motion() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const desfazScroll = initSmoothScroll({ duration: 1.05, smoothWheel: true, wheelMultiplier: 0.9 });
    let vivo = true;
    const ctx = gsap.context(() => {});

    ctx.add(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 42,
          autoAlpha: 0,
          duration: 0.82,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((el) => {
        gsap.from(el.children, {
          y: 42,
          autoAlpha: 0,
          duration: 0.82,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        });
      });
    });

    fontsReady().then(() => {
      if (!vivo) return;
      ctx.add(() => {
        gsap.utils.toArray<HTMLElement>("[data-line-reveal]").forEach((el) => {
          SplitText.create(el, {
            type: "lines",
            mask: "lines",
            linesClass: "lp-line",
            aria: "auto",
            onSplit(self) {
              return gsap.from(self.lines, {
                yPercent: 100,
                duration: 1,
                stagger: 0.1,
                ease: "power4.out",
                scrollTrigger: { trigger: el, start: "top 82%", once: true },
              });
            },
          });
        });
        ScrollTrigger.refresh();
      });
    });

    return () => {
      vivo = false;
      ctx.revert();
      desfazScroll();
    };
  }, []);

  return null;
}
