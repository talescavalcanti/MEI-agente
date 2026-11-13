/**
 * Recado no lugar de um bloco secundário que não carregou (números, prévia de
 * vídeo…). O resto da página segue de pé; quem falhou já foi logado no
 * servidor por quem chamou. Mesmo tom de falha do Banner da Visão geral:
 * superfície com a cor do recado, sem borda (§0.2).
 */
export default function BlockError({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card bg-danger-bg px-5 py-4 text-body-sm text-danger-text">
      {children}
    </div>
  );
}

/** Mensagem curta para o log: sem stack, mas com o que o banco disse. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
