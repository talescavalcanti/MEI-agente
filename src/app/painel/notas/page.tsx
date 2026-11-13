import type { Metadata } from "next";
import Link from "next/link";
import { moeda } from "@/lib/documentos/formato";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { FaturamentoAno, FiscalParametros, NotaAEmitir, NotaListada, NotaStatus } from "@/lib/dominio/tipos";
import Segmented from "@/app/components/Segmented";
import Cartao, { PrepararNota } from "../agente/Cartao";
import { montarCartaoNota } from "../agente/cartao-dados";
import EmptyModule from "../EmptyModule";
import PageHeader from "../PageHeader";
import Termometro from "./Termometro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Notas" };

const FILTROS: { key: "todas" | NotaStatus; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "rascunho", label: "Rascunhos" },
  { key: "aprovado", label: "Aprovadas" },
  { key: "divergente", label: "Divergentes" },
  { key: "emitida", label: "Emitidas" },
  { key: "descartado", label: "Descartadas" },
];

/**
 * Notas fiscais: termômetro do faturamento do ano, notas a emitir (tarefas
 * `emitir_nota` abertas) e a lista de notas com o cartão de cada uma. O
 * sistema não emite: o MEI emite no Emissor Nacional e registra aqui.
 */
export default async function Notas({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { mei } = await requireMei();
  const pedido = (await searchParams).status;
  const filtro = FILTROS.find((f) => f.key === pedido)?.key ?? "todas";

  const [fat, parametros, aEmitir, notas] = await Promise.all([
    rpcDb("faturamento_ano", { p_mei: mei.id }) as Promise<FaturamentoAno>,
    rpcDb("fiscal_parametros", {}) as Promise<FiscalParametros>,
    rpcDb("notas_a_emitir", { p_mei: mei.id }) as Promise<NotaAEmitir[]>,
    rpcDb("notas_listar", { p_mei: mei.id, p_status: filtro === "todas" ? null : filtro }) as Promise<NotaListada[]>,
  ]);

  if (filtro === "todas" && !notas.length && !aEmitir.length && fat.total === 0) {
    return (
      <EmptyModule
        section="Notas"
        title="Notas fiscais"
        summary="Nenhuma nota e nenhum pagamento no ano ainda. Quando um serviço for pago, peça ao agente para preparar a nota."
        phase={null}
        phaseNote="O agente prepara a nota com os dados do cadastro; você confere, emite no Emissor Nacional e registra aqui."
        items={[
          "Faturamento do ano frente ao limite do MEI",
          "Serviços pagos de empresas esperando nota",
          "Notas em rascunho, aprovadas, emitidas e com divergência",
        ]}
      />
    );
  }

  const semDadosFiscais = !mei.cnpj || !mei.codigo_tributacao;

  return (
    <div className="space-y-6">
      <PageHeader
        section="Notas"
        title="Notas fiscais"
        summary="O agente prepara a nota; você confere, emite no Emissor Nacional e registra a emissão aqui."
        actions={
          <Link className="text-link text-brand-600" href="/painel/agente">
            Falar com o agente
          </Link>
        }
      />

      {semDadosFiscais && (
        <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
          Para preparar notas, complete os dados fiscais em{" "}
          <Link href="/painel/negocio" className="font-medium underline">
            Meu negócio
          </Link>
          .
        </p>
      )}

      <Termometro fat={fat} tolerancia={parametros.tolerancia_excesso} />

      {aEmitir.length > 0 && (
        <section aria-labelledby="a-emitir" className="space-y-3">
          <h2 id="a-emitir" className="text-title-card">
            Notas a emitir
          </h2>
          <ul className="space-y-4">
            {aEmitir.map((t) => (
              <li key={t.tarefa_id} className="card space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-title-card">
                    #{String(t.numero).padStart(3, "0")} · {t.descricao}
                  </p>
                  <span className="text-caption text-muted">
                    {t.dias_desde_pagamento == null
                      ? "Pago"
                      : t.dias_desde_pagamento === 1
                        ? "Pago há 1 dia"
                        : `Pago há ${t.dias_desde_pagamento} dias`}
                  </span>
                </div>
                <p className="text-body-sm text-slate-700">
                  {t.cliente_nome}
                  {t.valor != null ? ` · ${moeda(t.valor)}` : ""}
                </p>
                <PrepararNota servicoId={t.servico_id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="lista-notas" className="space-y-3">
        <h2 id="lista-notas" className="text-title-card">
          Notas
        </h2>
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="Filtrar notas por situação"
            items={FILTROS.map((f) => ({
              ...f,
              href: f.key === "todas" ? "/painel/notas" : `/painel/notas?status=${f.key}`,
            }))}
            current={filtro}
          />
        </div>
        {!notas.length ? (
          <p className="card text-body text-muted">Nenhuma nota nesta situação.</p>
        ) : (
          <ul className="space-y-4">
            {notas.map((n) => (
              <li key={n.id}>
                <Cartao
                  cartao={{ tipo: "nota", id: n.id }}
                  inicial={montarCartaoNota(n, { clienteNome: n.cliente_nome, municipioMei: mei.municipio })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
