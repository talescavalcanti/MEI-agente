import PageHeader from "./PageHeader";

/**
 * Página de módulo que ainda não existe. Estado vazio honesto: diz o que vai
 * ter aqui e quando chega, sem número nem exemplo inventado. O guard
 * (`requireUser`) fica em cada página, não aqui: é a página que o Next
 * renderiza a cada navegação.
 */
export default function EmptyModule({
  section,
  title,
  summary,
  phase,
  phaseNote,
  items,
}: {
  section: string;
  title: string;
  summary: string;
  /** "Em breve", "Fase 2"… ou null quando ainda não tem data no plano. */
  phase: string | null;
  /** Uma frase sobre o que vem junto nessa fase. */
  phaseNote: string;
  /** O que vai existir nesta tela, em frases curtas. */
  items: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader section={section} title={title} summary={summary} />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <section aria-labelledby="o-que-vem" className="card lg:col-span-8">
          <p className="eyebrow">Ainda vazio</p>
          <h2 id="o-que-vem" className="mt-2 text-title-card tracking-[-0.02em]">
            O que vai ter aqui
          </h2>
          <ul className="mt-4 space-y-2">
            {items.map((it) => (
              <li key={it} className="flex gap-3 rounded-field bg-tonal px-4 py-3 text-body-sm text-slate-700">
                <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {it}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Quando chega" className="card-brand flex flex-col lg:col-span-4">
          <p className="eyebrow text-on-brand-muted">Quando chega</p>
          <p className="mt-3 font-heading text-stat font-bold tracking-[-0.04em]">{phase ?? "Sem data"}</p>
          <p className="mt-3 text-body-sm text-on-brand-muted">{phaseNote}</p>
        </section>
      </div>
    </div>
  );
}
