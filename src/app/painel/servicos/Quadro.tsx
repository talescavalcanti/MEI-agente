import type { ServicoListado } from "@/lib/dominio/tipos";
import { moeda } from "@/lib/documentos/formato";
import {
  dataPrevistaCurta,
  numeroServico,
  rotuloEstado,
  vencido,
  type ColunaQuadro,
} from "./etapas";

/**
 * Cartão de um serviço no quadro e na lista. Somente leitura: a etapa muda
 * pelo agente e pelas aprovações (a máquina de estados está no SQL).
 *
 * Data prevista vencida em serviço ainda não executado ganha um selo
 * "Atrasado" (texto, não só cor) e a data em tom de alerta.
 */
export function CartaoServico({
  servico: s,
  hoje,
  titulo: Titulo = "h3",
  mostrarEstado = false,
}: {
  servico: ServicoListado;
  /** Dia de hoje em São Paulo, AAAA-MM-DD. */
  hoje: string;
  /** Nível do título, para manter os headings em ordem onde o cartão aparece. */
  titulo?: "h2" | "h3";
  /** Na lista mostra o estado; no quadro a coluna já diz. */
  mostrarEstado?: boolean;
}) {
  const atrasado = vencido(s, hoje);
  return (
    <article className={`card space-y-2 p-4 ${atrasado ? "ring-1 ring-amber-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <Titulo className="min-w-0 break-words text-body font-semibold text-slate-900">
          <span className="nums text-muted">{numeroServico(s.numero)}</span> · {s.descricao}
        </Titulo>
        {mostrarEstado && (
          <span className="shrink-0 text-caption text-brand-600">{rotuloEstado(s.status)}</span>
        )}
      </div>
      <p className="truncate text-body-sm text-slate-700">{s.cliente_nome}</p>
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
        <div>
          <dt className="sr-only">Valor</dt>
          <dd className="nums text-slate-900">{s.valor == null ? "Valor não informado" : moeda(s.valor)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Data prevista</dt>
          <dd className={`nums ${atrasado ? "font-medium text-warn-text" : "text-muted"}`}>
            {dataPrevistaCurta(s.data_prevista)}
          </dd>
          {atrasado && (
            <dd className="rounded-chip bg-warn-bg px-2 py-0.5 text-caption font-medium text-warn-text">Atrasado</dd>
          )}
        </div>
      </dl>
    </article>
  );
}

/**
 * Quadro (kanban) de serviços: uma coluna por etapa, lado a lado. A rolagem
 * horizontal fica só dentro do quadro, com snap por coluna; a página não rola
 * de lado. No celular cada coluna ocupa quase a largura toda e a próxima
 * aparece na beirada, sinalizando que há mais à direita.
 */
export function Quadro({ colunas, hoje }: { colunas: ColunaQuadro[]; hoje: string }) {
  return (
    <div
      role="region"
      aria-label="Quadro de serviços por etapa. Role para o lado para ver todas as etapas."
      tabIndex={0}
      className="max-w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-card pb-3"
    >
      <ol className="flex gap-4">
        {colunas.map((col) => (
          <li
            key={col.status}
            className="flex w-[85%] max-w-[20rem] shrink-0 snap-start flex-col gap-3 rounded-card bg-tonal-blue p-3 sm:w-72"
          >
            <ColunaCabecalho coluna={col} />
            {col.servicos.length ? (
              <ul className="flex flex-col gap-3">
                {col.servicos.map((s) => (
                  <li key={s.id}>
                    <CartaoServico servico={s} hoje={hoje} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-4 text-center text-caption text-muted-on-tint">Nenhum serviço nesta etapa.</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ColunaCabecalho({ coluna }: { coluna: ColunaQuadro }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="text-title-card">
        {coluna.rotulo}{" "}
        <span className="nums text-body-sm font-normal text-muted-on-tint">
          <span aria-hidden="true">({coluna.quantidade})</span>
          <span className="sr-only">
            , {coluna.quantidade} {coluna.quantidade === 1 ? "serviço" : "serviços"}
          </span>
        </span>
      </h2>
      <p className="nums shrink-0 text-body-sm text-muted-on-tint">
        <span className="sr-only">Total: </span>
        {moeda(coluna.total)}
      </p>
    </div>
  );
}
