"use client"; // Error boundary tem que ser Client Component

import { useEffect } from "react";

/**
 * Último recurso: o próprio layout raiz (`app/layout.tsx`) quebrou.
 *
 * Esta tela SUBSTITUI o layout raiz, então traz o próprio <html>/<body> e não
 * recebe nada dele — nem o globals.css, nem as fontes. Por isso o estilo é
 * inline e a fonte é a do sistema: as cores são as do design system (canvas
 * #f5f8ff, cartão branco, primária #0052ff, texto slate), escritas à mão.
 * Não importa componente nenhum do app de propósito: se o que quebrou foi um
 * deles, a tela de erro quebraria junto.
 *
 * Sem mensagem crua, só o `digest` para achar o erro no log do servidor.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("app: erro no layout raiz", { digest: error.digest }, error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "4rem 1.25rem",
          boxSizing: "border-box",
          background: "#f5f8ff",
          color: "#475569",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <title>Algo deu errado · MEIagente</title>
        <main
          style={{
            width: "100%",
            maxWidth: "26rem",
            background: "#fff",
            borderRadius: "1.75rem",
            padding: "2rem",
            boxSizing: "border-box",
            boxShadow: "0 35px 90px -55px rgba(0, 82, 255, 0.45)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Algo deu errado
          </h1>
          <p style={{ margin: "0.4rem 0 1.75rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
            Não deu pra abrir o MEIagente agora. Pode ter sido uma instabilidade passageira. Tente
            de novo em instantes.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              width: "100%",
              padding: "0.8rem 1rem",
              border: 0,
              borderRadius: "0.85rem",
              background: "#0052ff",
              color: "#fff",
              font: "inherit",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
          {error.digest && (
            <p
              style={{
                margin: "1.25rem 0 0",
                textAlign: "center",
                fontSize: "0.7rem",
                color: "#64748b",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              código {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
