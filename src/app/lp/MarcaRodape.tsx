"use client";

import { useEffect, useRef } from "react";
import Wordmark from "../components/Wordmark";

/**
 * O logo gigante no pé da página (§7.10, `.landing-footer__mark`). Sobe de
 * baixo quando entra na tela, com a mesma curva do `watermark-rise` do
 * acervo; aqui a peça é o SVG da marca inteiro, não letras de uma fonte.
 * Sem JS, ou com menos movimento, ele já aparece no lugar.
 */
export default function MarcaRodape() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("is-armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.classList.add("is-in");
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="lp-marca-rodape">
      <Wordmark className="lp-marca-rodape__logo" />
    </div>
  );
}
