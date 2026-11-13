import type { Metadata } from "next";
import Link from "next/link";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { ServicoListado } from "@/lib/dominio/tipos";
import { ymdSP } from "@/lib/tz";
import Segmented from "@/app/components/Segmented";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";
import { FILTROS_LISTA, agruparPorEtapa, filtrarPorEstado } from "./etapas";
import { CartaoServico, Quadro } from "./Quadro";

export const metadata: Metadata = { title: "Serviços" };

type Visao = "quadro" | "lista";

const VISOES: { key: Visao; label: string; href: string }[] = [
  { key: "quadro", label: "Quadro", href: "/painel/servicos" },
  { key: "lista", label: "Lista", href: "/painel/servicos?visao=lista" },
];

/**
 * Serviços: por padrão um quadro com uma coluna por etapa da máquina de
 * estados (somente leitura: a etapa muda pelo agente e pelas aprovações).
 * `?visao=lista` mostra a lista, com o filtro `?estado=`.
 */
export default async function Servicos({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; estado?: string }>;
}) {
  const { mei } = await requireMei();
  const params = await searchParams;
  const visao: Visao = params.visao === "lista" ? "lista" : "quadro";
  const estado = FILTROS_LISTA.find((e) => e.key === params.estado)?.key ?? "todos";

  // Uma chamada só; o agrupamento e o filtro são feitos aqui.
  const servicos = (await rpcDb("servico_listar", { p_mei: mei.id, p_status: null })) as ServicoListado[];
  const hoje = ymdSP(new Date());

  if (!servicos.length) {
    return (
      <EmptyModule
        section="Serviços"
        title="Serviços"
        summary="Nenhum serviço ainda. Conte o primeiro trabalho ao agente para começar."
        phase={null}
        phaseNote="Os serviços cadastrados aparecerão aqui, organizados por etapa."
        items={["Etapa, valor e data prevista de cada serviço", "Total em reais por etapa"]}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        section="Serviços"
        title="Serviços"
        summary="Acompanhe em que etapa está cada trabalho. Para avançar uma etapa, fale com o agente ou aprove nos cartões."
        actions={
          <Link className="text-link text-brand-600" href="/painel/agente">
            Falar com o agente
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented label="Visão dos serviços" items={VISOES} current={visao} />
        {visao === "lista" && (
          <div className="max-w-full overflow-x-auto">
            <Segmented
              label="Filtrar serviços por estado"
              items={FILTROS_LISTA.map((e) => ({
                ...e,
                href:
                  e.key === "todos" ? "/painel/servicos?visao=lista" : `/painel/servicos?visao=lista&estado=${e.key}`,
              }))}
              current={estado}
            />
          </div>
        )}
      </div>

      {visao === "quadro" ? (
        <VisaoQuadro servicos={servicos} hoje={hoje} />
      ) : (
        <VisaoLista servicos={filtrarPorEstado(servicos, estado)} hoje={hoje} />
      )}
    </div>
  );
}

function VisaoQuadro({ servicos, hoje }: { servicos: ServicoListado[]; hoje: string }) {
  const { colunas, cancelados } = agruparPorEtapa(servicos);
  return (
    <>
      <Quadro colunas={colunas} hoje={hoje} />
      {cancelados.length > 0 && (
        <details className="card p-4 sm:p-5">
          <summary className="cursor-pointer select-none rounded-field text-title-card">
            Cancelados <span className="nums text-body-sm font-normal text-muted">({cancelados.length})</span>
          </summary>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cancelados.map((s) => (
              <li key={s.id}>
                <CartaoServico servico={s} hoje={hoje} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function VisaoLista({ servicos, hoje }: { servicos: ServicoListado[]; hoje: string }) {
  if (!servicos.length) return <p className="card text-body text-muted">Nenhum serviço neste estado.</p>;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {servicos.map((s) => (
        <li key={s.id}>
          <CartaoServico servico={s} hoje={hoje} titulo="h2" mostrarEstado />
        </li>
      ))}
    </ul>
  );
}
