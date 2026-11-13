"use client"; // Error boundary tem que ser Client Component

import { useEffect } from "react";
import Button from "../components/Button";

/**
 * Tela de erro das páginas do painel.
 *
 * Envolve cada `page.tsx` de /painel (e as de baixo), mas NÃO o `layout.tsx`
 * do mesmo segmento — a barra de navegação continua de pé e a pessoa pode
 * trocar de aba. Erro de bloco secundário (números, miniaturas) não chega
 * aqui: cada página isola o dela. Este é o último recurso, para quando a
 * resposta da própria página não veio.
 *
 * Nada da mensagem vai para a tela: em produção o Next já troca a mensagem de
 * erro de Server Component por uma genérica, e a de Client Component pode ter
 * detalhe interno. O `digest` é o que liga este erro ao log do servidor.
 */
export default function PainelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("painel: erro na página", { digest: error.digest }, error);
  }, [error]);

  /* O h1 visível diz o que aconteceu; em que aba se está, o item ativo da
     sidebar mostra (o cabeçalho da página caiu junto com ela). */
  return (
    <div className="mx-auto max-w-xl rounded-card bg-surface p-8 text-center shadow-card sm:p-10">
      <span
        aria-hidden="true"
        className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-bg text-title-dialog text-danger-text"
      >
        ⚠
      </span>
      <h1 className="mt-4 text-title-dialog tracking-[-0.03em]">Não deu pra carregar esta página</h1>
      <p className="mx-auto mt-2 max-w-sm text-body-sm text-muted">
        Pode ter sido uma instabilidade passageira. Tente de novo; se continuar, troque de aba e
        volte em alguns minutos.
      </p>
      <div className="mt-6 flex justify-center">
        <Button onClick={() => unstable_retry()}>Tentar de novo</Button>
      </div>
      {error.digest && (
        <p className="nums mx-auto mt-5 w-fit rounded-full bg-tonal px-3 py-1 text-caption text-muted-on-tint">
          código {error.digest}
        </p>
      )}
    </div>
  );
}
