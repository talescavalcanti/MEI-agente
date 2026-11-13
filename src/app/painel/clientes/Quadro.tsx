import { moeda } from "@/lib/documentos/formato";
import { linkWhatsapp, type CartaoCliente, type ColunaQuadro } from "./pipeline";

/**
 * Quadro somente leitura: a etapa vem dos serviços, então não há arrastar.
 * No celular as colunas empilham e cada uma recolhe (`<details>`); a partir de
 * `lg` ficam lado a lado e a rolagem horizontal mora só dentro do quadro.
 */
export default function Quadro({ colunas }: { colunas: ColunaQuadro[] }) {
  return (
    <div
      role="region"
      aria-label="Quadro de clientes por etapa"
      tabIndex={0}
      className="relative -mx-1 space-y-3 px-1 pb-2 lg:flex lg:snap-x lg:snap-mandatory lg:items-start lg:gap-4 lg:space-y-0 lg:overflow-x-auto"
    >
      {colunas.map((col) => (
        <Coluna key={col.etapa} coluna={col} />
      ))}
    </div>
  );
}

function Coluna({ coluna }: { coluna: ColunaQuadro }) {
  const idTitulo = `etapa-${coluna.etapa}`;
  const qtd = coluna.cartoes.length;
  return (
    <section
      aria-labelledby={idTitulo}
      className="rounded-card bg-tonal p-3 lg:w-72 lg:shrink-0 lg:snap-start xl:w-80"
    >
      <details open={qtd > 0} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-field px-2 py-1.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-title-card">
              {coluna.rotulo}{" "}
              <span className="nums text-body-sm font-normal text-muted-on-tint">
                ({qtd}
                <span className="sr-only"> {qtd === 1 ? "cliente" : "clientes"}</span>)
              </span>
            </h2>
            {coluna.etapa === "a_receber" && coluna.emAberto > 0 && (
              <span className="nums mt-0.5 block text-caption text-muted-on-tint">{moeda(coluna.emAberto)} em aberto</span>
            )}
          </div>
          <span aria-hidden="true" className="text-muted-on-tint transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        {qtd ? (
          <ul className="mt-3 space-y-3">
            {coluna.cartoes.map((c) => (
              <li key={c.cliente.id}>
                <Cartao cartao={c} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 px-2 pb-1 text-body-sm text-muted-on-tint">Nenhum cliente nesta etapa.</p>
        )}
      </details>
    </section>
  );
}

function Cartao({ cartao: { cliente, resumo } }: { cartao: CartaoCliente }) {
  const wa = linkWhatsapp(cliente.whatsapp);
  const temDetalhes = Boolean(cliente.endereco || cliente.observacoes);
  return (
    <article className="card space-y-2 p-4">
      <h3 className="text-title-card break-words">{cliente.nome}</h3>
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link nums text-body-sm text-brand-600"
          aria-label={`Abrir conversa no WhatsApp com ${cliente.nome} (abre em nova aba)`}
        >
          {cliente.whatsapp}
        </a>
      ) : (
        <p className="text-body-sm text-muted">WhatsApp não informado</p>
      )}
      <p className="rounded-field bg-tonal-blue px-3 py-2 text-body-sm text-slate-800">
        <span className="sr-only">Próximo passo: </span>
        {resumo.proximoPasso}
      </p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <div className="flex gap-1">
          <dt>Em andamento</dt>
          <dd className="nums font-semibold text-slate-700">{resumo.emAndamento}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Em aberto</dt>
          <dd className="nums font-semibold text-slate-700">{moeda(resumo.emAberto)}</dd>
        </div>
      </dl>
      {temDetalhes && (
        <details className="text-body-sm">
          <summary className="cursor-pointer text-caption text-brand-600">Endereço e observações</summary>
          <div className="mt-2 space-y-1">
            {cliente.endereco && <p className="break-words text-slate-700">{cliente.endereco}</p>}
            {cliente.observacoes && <p className="break-words text-muted">{cliente.observacoes}</p>}
          </div>
        </details>
      )}
    </article>
  );
}
