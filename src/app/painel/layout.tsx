import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import PainelShell from "./PainelShell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Cada aba põe o próprio nome (`title: "Clientes"`) e o template completa.
   Vale só para as abas filhas: o Início (painel/page.tsx) é do mesmo
   segmento e escreve o título inteiro. `default` cobre aba que não definir. */
export const metadata: Metadata = {
  title: { template: "%s · MEIagente", default: "Painel · MEIagente" },
};

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  /* Este `requireUser` serve para montar a navegação (nome) e para barrar
     quem chegou sem sessão na primeira carga. Ele NÃO é o guard das páginas:
     layout não re-renderiza a cada navegação de cliente, então cada página
     refaz a checagem por conta própria.
     Aqui é `requireUser` e não `requireMei` de propósito: este layout também
     envolve /painel/negocio, a tela para onde o `requireMei` manda quem ainda
     não tem negócio. Exigir MEI aqui faria um laço de redirect. As páginas
     (menos `negocio`) começam com `requireMei()`. */
  const me = await requireUser();

  return (
    <>
      {/* Primeiro foco da página: pula a sidebar direto para o conteúdo.
          Invisível até receber foco. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-surface focus:px-4 focus:py-2 focus:text-body-sm focus:text-slate-900 focus:shadow-card"
      >
        Pular para o conteúdo
      </a>
      <PainelShell userName={me.name}>{children}</PainelShell>
    </>
  );
}
