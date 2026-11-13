"use client";
// Contexto do GSAP amarrado ao ciclo de vida do componente: tudo o que for criado dentro de
// `setup` (tweens, timelines, ScrollTriggers, SplitText) é revertido no cleanup.
// Funções chamadas depois (handlers, handles via ref) entram no mesmo contexto com
// `ctx.add(() => …)`; o padrão é criar a API dentro do setup e guardá-la num ref:
//
//   const api = useRef<Api | null>(null);
//   useGsap((ctx) => {
//     api.current = { play: () => ctx.add(() => gsap.to(...)) };
//     return () => (api.current = null);
//   }, [deps], scopeRef);
//   useImperativeHandle(ref, () => ({ play: () => api.current?.play() }), []);
import { useLayoutEffect } from "react";
import type { DependencyList, RefObject } from "react";
import { gsap } from "./core";

type Cleanup = void | (() => void);

export function useGsap(setup: (ctx: gsap.Context) => Cleanup, deps: DependencyList = [], scope?: RefObject<Element | null>) {
  useLayoutEffect(() => {
    let cleanup: Cleanup;
    const ctx = gsap.context((self) => {
      cleanup = setup(self);
    }, scope?.current ?? undefined);
    return () => {
      if (typeof cleanup === "function") cleanup();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
