/**
 * Cabeçalho de toda página do painel: sobretítulo ("MEIAGENTE · INÍCIO"),
 * título grande (o h1 da página), resumo opcional e, à direita, as ações da
 * página (seletor de período, "Atualizar agora"…). Sem ações, o lado direito
 * simplesmente não existe: nada de botão de enfeite.
 *
 * Sem hooks e sem "use client": serve tanto à página (servidor) quanto a um
 * componente de cliente que monte a própria tela.
 */
export default function PageHeader({
  section,
  title,
  summary,
  actions,
}: {
  /** Vai no sobretítulo, depois de "MEIagente ·". */
  section: string;
  title: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 pb-2 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="page-eyebrow">MEIagente · {section}</p>
        <h1 className="page-title mt-3">{title}</h1>
        {summary && <p className="mt-3 max-w-2xl text-body text-muted-on-tint sm:text-[0.95rem]">{summary}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
