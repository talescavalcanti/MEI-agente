"use client";

import { useState } from "react";
import Button from "../components/Button";

/**
 * A conversa do README §3, montada com as mesmas peças da tela do agente:
 * bolha `.dm-bubble`, `.card`, sub-cartão tonal, selo de status e os botões
 * do `Cartao.tsx`. Não chama servidor nenhum: Aprovar e Descartar mudam o
 * estado só aqui, para a pessoa sentir o fluxo de aprovação antes de criar a
 * conta.
 *
 * A entrada das mensagens é animação CSS (`.lp-demo__step`, com atraso por
 * `--d`), não JS: o hero aparece certo antes da hidratação e não pisca.
 * "Ver de novo" remonta a conversa por `key`, o que reinicia as animações.
 */

type Decisao = "aprovado" | "descartado";

const ITENS = [
  { id: "orcamento", tipo: "Orçamento", titulo: "Orçamento #012 · Maria Souza" },
  { id: "contrato", tipo: "Contrato", titulo: "Minuta de prestação de serviço" },
  { id: "mensagem", tipo: "Mensagem", titulo: "Confirmação para Maria Souza" },
] as const;

const STATUS: Record<Decisao | "rascunho", string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  descartado: "Descartado",
};

export default function HeroDemo() {
  const [rodada, setRodada] = useState(0);
  return <Conversa key={rodada} onReiniciar={() => setRodada((r) => r + 1)} />;
}

function Conversa({ onReiniciar }: { onReiniciar: () => void }) {
  const [decisoes, setDecisoes] = useState<(Decisao | undefined)[]>([]);
  const [saindo, setSaindo] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);

  /* O cartão da frente é o primeiro sem decisão; enquanto um sai, ele ainda
     conta como "da frente" para a pilha não pular antes da animação. */
  const frente = decisoes.length;
  const terminou = frente >= ITENS.length && saindo === null;

  function decidir(d: Decisao) {
    if (saindo !== null) return;
    const i = frente;
    setEditando(false);
    setSaindo(i);
    setDecisoes((cur) => [...cur, d]);
    window.setTimeout(() => setSaindo(null), 520);
  }

  return (
    <div className="lp-demo" aria-label="Exemplo de conversa com o agente">
      <div className="lp-demo__bar">
        <span className="lp-demo__who">
          <span className="lp-demo__selo" aria-hidden="true" />
          Agente
        </span>
        <span className="lp-demo__tag">Exemplo ilustrativo</span>
      </div>

      <ol className="lp-demo__feed">
        <li className="lp-demo__step lp-bubble lp-bubble--eu" style={{ "--d": "0.5s" } as React.CSSProperties}>
          Fechei uma instalação de ar-condicionado por R$ 800 para sexta.
        </li>
        <li className="lp-demo__step lp-bubble dm-bubble" style={{ "--d": "1.5s" } as React.CSSProperties}>
          Entendi. Já registrei o serviço para sexta-feira (R$ 800). Qual o nome e o WhatsApp do cliente? O
          pagamento é à vista, Pix ou parcelado?
        </li>
        <li className="lp-demo__step lp-bubble lp-bubble--eu" style={{ "--d": "2.6s" } as React.CSSProperties}>
          Maria Souza, Setor Bueno. Pix na entrega.
        </li>
        <li className="lp-demo__step lp-bubble dm-bubble" style={{ "--d": "3.5s" } as React.CSSProperties}>
          Preparei 3 itens para você revisar.
        </li>
      </ol>

      <div className="lp-demo__step" style={{ "--d": "4.1s" } as React.CSSProperties}>
        {terminou ? (
          <Resumo decisoes={decisoes as Decisao[]} onReiniciar={onReiniciar} />
        ) : (
          <>
            <p className="lp-demo__count" aria-live="polite">
              Item {Math.min(frente + (saindo === null ? 1 : 0), ITENS.length)} de {ITENS.length}
            </p>
            <div className="lp-deck">
              {ITENS.map((item, i) => {
                const pos = i - (saindo !== null ? saindo : frente);
                const decidido = decisoes[i];
                const saiu = decidido !== undefined && saindo !== i;
                const ativo = pos === 0 && saindo === null;
                return (
                  <article
                    key={item.id}
                    className="card lp-deck__card"
                    data-pos={saiu ? "fora" : saindo === i ? "saindo" : Math.min(pos, 2)}
                    data-decisao={decidido}
                    aria-hidden={!ativo}
                    inert={!ativo}
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-caption text-muted">{item.tipo}</p>
                        <h3 className="text-title-card font-semibold">{item.titulo}</h3>
                      </div>
                      <span className="lp-chip">{STATUS[decidido ?? "rascunho"]}</span>
                    </header>

                    <Corpo id={item.id} />

                    {ativo && editando && (
                      <p role="status" className="text-body-sm text-muted">
                        No app, o texto abre para você mudar o que quiser antes de aprovar.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button size="compact" onClick={() => decidir("aprovado")}>
                        Aprovar
                      </Button>
                      <button type="button" className="btn-quiet" onClick={() => setEditando(true)}>
                        Editar
                      </button>
                      <button type="button" className="btn-quiet btn-quiet--danger" onClick={() => decidir("descartado")}>
                        Descartar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Corpo({ id }: { id: (typeof ITENS)[number]["id"] }) {
  if (id === "orcamento") {
    return (
      <div className="rounded-field bg-tonal p-4 text-body-sm">
        <p className="flex justify-between gap-4">
          <span>Instalação de ar-condicionado</span>
          <span className="shrink-0 tabular-nums">R$ 800,00</span>
        </p>
        <p className="mt-3 flex justify-between gap-4 border-t border-line pt-3 font-semibold text-slate-900">
          <span>Total</span>
          <span className="tabular-nums">R$ 800,00</span>
        </p>
        <p className="mt-2 text-caption text-muted-on-tint">Pagamento: Pix na entrega · Sexta-feira, Setor Bueno</p>
      </div>
    );
  }
  if (id === "contrato") {
    return (
      <>
        <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
          Minuta gerada por IA. Revise antes de usar: ela não substitui orientação jurídica.
        </p>
        <p className="rounded-field bg-tonal p-4 text-body-sm">
          Contratante: Maria Souza. Objeto: instalação de ar-condicionado no Setor Bueno, na sexta-feira. Valor: R$
          800,00, via Pix na entrega.
        </p>
      </>
    );
  }
  return (
    <p className="rounded-field bg-tonal-blue p-4 text-body-sm text-slate-700">
      Olá, Maria! Confirmando a instalação do ar-condicionado na sexta-feira, no Setor Bueno. Valor combinado: R$ 800,
      pagamento via Pix na entrega. Qualquer dúvida, é só chamar.
    </p>
  );
}

function Resumo({ decisoes, onReiniciar }: { decisoes: Decisao[]; onReiniciar: () => void }) {
  const aprovouMensagem = decisoes[2] === "aprovado";
  return (
    <div className="card lp-resumo" role="status">
      <p className="text-caption text-muted">Revisão concluída</p>
      <ul className="mt-3 space-y-2 text-body-sm">
        {ITENS.map((item, i) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span className="text-slate-900">{item.titulo}</span>
            <span className="lp-chip" data-decisao={decisoes[i]}>
              {STATUS[decisoes[i]]}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-body-sm text-muted">
        Nada foi enviado.{" "}
        {aprovouMensagem
          ? "A mensagem aprovada fica pronta para você copiar ou abrir no WhatsApp da Maria."
          : "Sem mensagem aprovada, a Maria não recebe nada."}
      </p>
      <button type="button" className="btn-quiet mt-3 -ml-3" onClick={onReiniciar}>
        Ver o exemplo de novo
      </button>
    </div>
  );
}
