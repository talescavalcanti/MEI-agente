"use client";

import { useEffect, useId, useRef } from "react";
import { IconClose } from "./icons";

/**
 * Janela modal do painel — `<dialog>` nativo aberto com `showModal()`.
 *
 * O nativo dá de graça o que o `div fixed` de antes não tinha: o resto da
 * página fica inerte (Tab e leitor de tela não saem do modal), o Esc dispara
 * `cancel`, e o papel de diálogo é anunciado com o nome do título
 * (`aria-labelledby`). O que fica por conta daqui:
 *
 * - Foco inicial: o campo marcado com `data-autofocus`. O `autoFocus` do React
 *   não serve — ele foca no commit, antes do `showModal()`, que em seguida
 *   joga o foco no primeiro focável (o ✕).
 * - Foco de volta para quem abriu (o "Editar", o "Novo cliente") ao fechar.
 *   Sem isso o foco cai no <body> e o teclado volta para o topo da página.
 * - Esc chama `onClose` em vez de fechar sozinho: quem controla se o diálogo
 *   existe é o estado do React, não o elemento.
 *
 * Clique fora NÃO fecha, de propósito: os diálogos daqui são formulários, e
 * um clique no véu jogaria fora o que foi digitado.
 *
 * `aside` é uma coluna ao lado do cartão (a prévia do celular). No celular
 * ela vai para DEPOIS do cartão: o formulário é o que a pessoa veio fazer.
 */
export default function Dialog({
  title,
  subtitle,
  icon,
  onClose,
  children,
  aside,
}: {
  title: string;
  /** Uma linha do que se faz aqui, como o subtítulo da topbar. */
  subtitle?: string;
  /** Ícone do cabeçalho, num círculo azul-claro (ver components/icons). */
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      // Quem abriu pode ter saído da tela junto (linha apagada): aí não há
      // para onde voltar, e o navegador decide.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-500">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-title-dialog leading-tight tracking-[-0.03em]">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-body-sm text-muted-on-tint">{subtitle}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:text-slate-900 ${
          aside ? "bg-surface shadow-card" : "bg-tonal hover:bg-slate-100"
        }`}
      >
        <IconClose className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="panel-dialog"
    >
      {aside ? (
        /* Janela grande (formulário + prévia): é um pedaço do painel. Chão
           cinza, cabeçalho solto em cima e os blocos brancos embaixo, cada
           etapa do formulário num cartão. A prévia acompanha a rolagem. */
        <div className="mx-auto my-6 w-full max-w-5xl rounded-panel bg-canvas p-4 shadow-lift sm:p-6">
          <div className="px-1 pb-5">{header}</div>
          {/* Lado a lado só a partir de lg: em md a coluna de 288px deixava o
              formulário com 380px. Abaixo de lg o `aside` não aparece; quem
              usa a coluna oferece outro acesso a ela (por exemplo, recolher
              a prévia antes das ações). */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_288px]">
            <div className="min-w-0">{children}</div>
            <div className="hidden lg:sticky lg:top-2 lg:block lg:self-start">{aside}</div>
          </div>
        </div>
      ) : (
        /* Janela pequena: um cartão branco só. */
        <div className="mx-auto my-10 w-full max-w-lg rounded-panel bg-surface shadow-brand">
          <div className="px-5 pb-1 pt-5 sm:px-7 sm:pt-6">{header}</div>
          {children}
        </div>
      )}
    </dialog>
  );
}
