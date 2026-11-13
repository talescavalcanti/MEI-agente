"use client"; // Error boundary tem que ser Client Component

import { useEffect } from "react";
import AuthShell from "./components/AuthShell";
import Button from "./components/Button";

/**
 * Tela de erro de qualquer rota do app.
 *
 * Fica na raiz porque é daqui que ela alcança o `painel/layout.tsx`: o
 * `painel/error.tsx` só cobre as páginas de dentro do painel, não o layout do
 * próprio segmento. Erro na barra do painel (sessão, conta) ou em /login,
 * /setup etc. cai aqui, ainda dentro do layout raiz — com fontes e CSS.
 * Só o layout raiz quebrado passa daqui, e aí é o `global-error.tsx`.
 *
 * Mesma regra do painel: nada da mensagem na tela, só o `digest`, que liga
 * este erro ao log do servidor.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("app: erro na rota", { digest: error.digest }, error);
  }, [error]);

  return (
    <AuthShell
      title="Algo deu errado"
      subtitle="Pode ter sido uma instabilidade passageira. Tente de novo em instantes."
    >
      <Button onClick={() => unstable_retry()} block>
        Tentar de novo
      </Button>
      {error.digest && (
        <p className="nums mt-5 text-center text-caption text-muted">
          código {error.digest}
        </p>
      )}
    </AuthShell>
  );
}
