import { moeda } from "@/lib/documentos/formato";
import type { FaixaFaturamento, FaturamentoAno } from "@/lib/dominio/tipos";

export type TomFaixa = "ok" | "atencao" | "alerta" | "excedido";

/**
 * Rótulo e explicação da faixa do faturamento. A regra do excesso (até a
 * tolerância acima do limite: segue MEI no ano e desenquadra no ano
 * seguinte; acima dela: desenquadramento retroativo) vem do Step 0 da Task
 * 17 (LC 123/2006, art. 18-A). Limite e tolerância vêm do banco
 * (`faturamento_ano` e `fiscal_parametros`), nunca daqui.
 */
export function textoFaixa(
  f: FaturamentoAno,
  tolerancia: number,
): { rotulo: string; tom: TomFaixa; texto: string } {
  const limite = moeda(f.limite);
  const teto = moeda(Math.round(f.limite * (1 + tolerancia) * 100) / 100);
  const pctTolerancia = `${Math.round(tolerancia * 100)}%`;
  const ritmo =
    f.projecao > f.limite
      ? ` No ritmo atual, o ano fecha em ${moeda(f.projecao)}, acima do limite de ${limite}.`
      : "";

  const faixas: Record<FaixaFaturamento, { rotulo: string; tom: TomFaixa; texto: string }> = {
    ok: {
      rotulo: "Dentro do limite",
      tom: "ok",
      texto: `Você está dentro do limite do MEI para o ano, de ${limite}.${ritmo}`,
    },
    atencao: {
      rotulo: "Atenção",
      tom: "atencao",
      texto: `Você já passou de 70% do limite do ano, de ${limite}.${ritmo}`,
    },
    alerta: {
      rotulo: "Perto do limite",
      tom: "alerta",
      texto: `Você já passou de 90% do limite do ano, de ${limite}. Planeje os próximos serviços com cuidado.${ritmo}`,
    },
    excedido: {
      rotulo: "Limite ultrapassado",
      tom: "excedido",
      texto:
        `Você passou do limite do MEI, de ${limite}. Enquanto o excesso ficar em até ${pctTolerancia} (faturamento até ${teto}), ` +
        "você continua MEI até o fim do ano, paga o DAS complementar sobre o excesso e passa a microempresa em 1º de janeiro do ano seguinte. " +
        "Procure um contador para planejar a mudança.",
    },
    excedido_grave: {
      rotulo: "Muito acima do limite",
      tom: "excedido",
      texto:
        `Você faturou mais de ${teto}, mais de ${pctTolerancia} acima do limite de ${limite}. ` +
        "Nesse caso o desenquadramento do MEI é retroativo a 1º de janeiro deste ano (ou à abertura, se o negócio abriu neste ano), " +
        "com os impostos de microempresa desde então. Procure um contador o quanto antes.",
    },
  };
  return faixas[f.faixa];
}

const COR: Record<TomFaixa, { barra: string; selo: string }> = {
  ok: { barra: "bg-ok", selo: "bg-tonal text-muted-on-tint" },
  atencao: { barra: "bg-amber-500", selo: "bg-warn-bg text-warn-text" },
  alerta: { barra: "bg-amber-500", selo: "bg-warn-bg text-warn-text" },
  excedido: { barra: "bg-danger", selo: "bg-danger-bg text-danger-text" },
};

/** Termômetro do faturamento do ano frente ao limite do MEI. */
export default function Termometro({ fat, tolerancia }: { fat: FaturamentoAno; tolerancia: number }) {
  const t = textoFaixa(fat, tolerancia);
  const cor = COR[t.tom];
  const largura = Math.max(0, Math.min(100, fat.percentual));
  const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(fat.percentual);

  return (
    <section aria-labelledby="termometro" className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Faturamento de {fat.ano}</p>
          <h2 id="termometro" className="mt-2 font-heading text-stat font-bold tracking-[-0.04em]">
            {moeda(fat.total)}
          </h2>
          <p className="text-body-sm text-muted">
            {pct}% do limite de {moeda(fat.limite)}
          </p>
        </div>
        <span className={`rounded-chip px-2.5 py-1 text-caption font-medium ${cor.selo}`}>{t.rotulo}</span>
      </div>

      <div
        role="meter"
        aria-label="Faturamento do ano em relação ao limite do MEI"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(largura)}
        className="h-3 overflow-hidden rounded-full bg-tonal"
      >
        <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${largura}%` }} />
      </div>

      <dl className="grid gap-3 text-body-sm sm:grid-cols-3">
        <div className="rounded-field bg-tonal px-4 py-3">
          <dt className="text-caption text-muted">Com nota</dt>
          <dd className="tabular-nums">{moeda(fat.com_nota)}</dd>
        </div>
        <div className="rounded-field bg-tonal px-4 py-3">
          <dt className="text-caption text-muted">Sem nota</dt>
          <dd className="tabular-nums">{moeda(fat.sem_nota)}</dd>
        </div>
        <div className="rounded-field bg-tonal px-4 py-3">
          <dt className="text-caption text-muted">Projeção até o fim do ano</dt>
          <dd className="tabular-nums">{moeda(fat.projecao)}</dd>
        </div>
      </dl>

      <p
        className={`rounded-field px-4 py-3 text-body-sm ${
          t.tom === "ok" ? "bg-tonal text-slate-700" : t.tom === "excedido" ? "bg-danger-bg text-danger-text" : "bg-warn-bg text-warn-text"
        }`}
      >
        {t.texto}
      </p>
    </section>
  );
}
