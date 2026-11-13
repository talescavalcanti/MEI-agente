// Etapas do quadro de Serviços: ordem e rótulos da máquina de estados (que mora
// no SQL, em 03-servicos.sql) e o agrupamento da lista de `servico_listar`.
// Puro: sem banco nem React, para testar em tests/telas/servicos-etapas.test.ts.
import type { ServicoListado, ServicoStatus } from "@/lib/dominio/tipos";
import { formatSP } from "@/lib/tz";

export type EtapaQuadro = Exclude<ServicoStatus, "cancelado">;

/** Colunas do quadro, na ordem da máquina de estados. Cancelado fica fora. */
export const ETAPAS: readonly { status: EtapaQuadro; rotulo: string }[] = [
  { status: "rascunho", rotulo: "Rascunho" },
  { status: "orcado", rotulo: "Orçado" },
  { status: "aguardando_resposta", rotulo: "Aguardando resposta" },
  { status: "confirmado", rotulo: "Confirmado" },
  { status: "agendado", rotulo: "Agendado" },
  { status: "executado", rotulo: "Executado" },
  { status: "pago", rotulo: "Pago" },
];

/** Filtros da visão em lista (`?estado=`), no plural. */
export const FILTROS_LISTA: readonly { key: "todos" | ServicoStatus; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "rascunho", label: "Rascunhos" },
  { key: "orcado", label: "Orçados" },
  { key: "aguardando_resposta", label: "Aguardando" },
  { key: "confirmado", label: "Confirmados" },
  { key: "agendado", label: "Agendados" },
  { key: "executado", label: "Executados" },
  { key: "pago", label: "Pagos" },
  { key: "cancelado", label: "Cancelados" },
];

/** Rótulo no singular de qualquer estado, inclusive cancelado. */
export function rotuloEstado(status: ServicoStatus): string {
  if (status === "cancelado") return "Cancelado";
  return ETAPAS.find((e) => e.status === status)?.rotulo ?? status;
}

export type ColunaQuadro = {
  status: EtapaQuadro;
  rotulo: string;
  servicos: ServicoListado[];
  quantidade: number;
  /** Soma dos valores informados, em reais (serviço sem valor conta 0). */
  total: number;
};

/** Data prevista mais próxima primeiro, sem data no fim; empate pelo número. */
function porDataPrevista(a: ServicoListado, b: ServicoListado): number {
  if (a.data_prevista !== b.data_prevista) {
    if (a.data_prevista == null) return 1;
    if (b.data_prevista == null) return -1;
    return a.data_prevista < b.data_prevista ? -1 : 1;
  }
  return a.numero - b.numero;
}

/** Separa os serviços nas colunas do quadro e põe os cancelados à parte. */
export function agruparPorEtapa(servicos: readonly ServicoListado[]): {
  colunas: ColunaQuadro[];
  cancelados: ServicoListado[];
} {
  const colunas = ETAPAS.map((etapa) => {
    const daEtapa = servicos.filter((s) => s.status === etapa.status).sort(porDataPrevista);
    // Em centavos, para 0,10 + 0,20 dar 0,30.
    const centavos = daEtapa.reduce((soma, s) => soma + Math.round((s.valor ?? 0) * 100), 0);
    return { ...etapa, servicos: daEtapa, quantidade: daEtapa.length, total: centavos / 100 };
  });
  const cancelados = servicos.filter((s) => s.status === "cancelado").sort(porDataPrevista);
  return { colunas, cancelados };
}

/** Estados em que a data prevista ainda pode "vencer" (o trabalho não foi feito). */
const ANTES_DA_EXECUCAO: ReadonlySet<ServicoStatus> = new Set([
  "rascunho",
  "orcado",
  "aguardando_resposta",
  "confirmado",
  "agendado",
]);

/** Data prevista já passou (antes de `hoje`, AAAA-MM-DD em São Paulo) e o serviço não foi executado. */
export function vencido(s: ServicoListado, hoje: string): boolean {
  return s.data_prevista != null && s.data_prevista < hoje && ANTES_DA_EXECUCAO.has(s.status);
}

/** Visão em lista: `todos` ou um estado. */
export function filtrarPorEstado(
  servicos: readonly ServicoListado[],
  estado: "todos" | ServicoStatus,
): ServicoListado[] {
  return estado === "todos" ? [...servicos] : servicos.filter((s) => s.status === estado);
}

/** `7` → `#007`. */
export function numeroServico(numero: number): string {
  return `#${String(numero).padStart(3, "0")}`;
}

/** `2026-11-20` → `20/11/2026`; sem data → `Sem data`. */
export function dataPrevistaCurta(ymd: string | null): string {
  // Meio-dia UTC cai no mesmo dia em São Paulo.
  return ymd ? formatSP(`${ymd}T12:00:00Z`, { dateStyle: "short" }) : "Sem data";
}
