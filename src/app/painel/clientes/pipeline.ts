// Quadro de clientes: em que etapa do relacionamento cada cliente está. A etapa
// é consequência dos serviços dele, então não se arrasta cartão: muda o serviço
// e o cliente muda de coluna. Puro, sem banco nem relógio.
import type { Cliente, ServicoListado, ServicoStatus } from "@/lib/dominio/tipos";
import { moeda } from "@/lib/documentos/formato";

export type Etapa = "novo" | "negociacao" | "fechado" | "a_receber" | "concluido";

/** Colunas na ordem do quadro. */
export const ETAPAS: ReadonlyArray<{ etapa: Etapa; rotulo: string }> = [
  { etapa: "novo", rotulo: "Novo contato" },
  { etapa: "negociacao", rotulo: "Em negociação" },
  { etapa: "fechado", rotulo: "Fechado" },
  { etapa: "a_receber", rotulo: "A receber" },
  { etapa: "concluido", rotulo: "Concluído" },
];

const NEGOCIACAO: ServicoStatus[] = ["rascunho", "orcado", "aguardando_resposta"];
const FECHADO: ServicoStatus[] = ["confirmado", "agendado"];

type ServicoDaEtapa = Pick<ServicoListado, "status">;

/**
 * Prioridade: a receber, fechado, em negociação, concluído (todos os não
 * cancelados pagos) e, sem serviço ou só com cancelados, novo contato.
 */
export function etapaDoCliente(servicos: ServicoDaEtapa[]): Etapa {
  const vivos = servicos.filter((s) => s.status !== "cancelado");
  if (!vivos.length) return "novo";
  if (vivos.some((s) => s.status === "executado")) return "a_receber";
  if (vivos.some((s) => FECHADO.includes(s.status))) return "fechado";
  if (vivos.some((s) => NEGOCIACAO.includes(s.status))) return "negociacao";
  return "concluido";
}

const num = (n: number) => `#${String(n).padStart(3, "0")}`;
const valorDe = (s: Pick<ServicoListado, "valor">) => {
  const v = s.valor == null ? NaN : Number(s.valor);
  return Number.isFinite(v) ? v : null;
};
/** "2026-11-15" → "15/11". A data prevista é dia de calendário, sem fuso. */
const diaMes = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Menor número primeiro; com data, a mais próxima primeiro e sem data por último. */
function primeiro(lista: ServicoListado[], porData = false): ServicoListado {
  return [...lista].sort((a, b) => {
    if (porData) {
      const da = a.data_prevista ?? "9999";
      const db = b.data_prevista ?? "9999";
      if (da !== db) return da < db ? -1 : 1;
    }
    return a.numero - b.numero;
  })[0];
}

function proximoPasso(etapa: Etapa, vivos: ServicoListado[]): string {
  const com = (sts: ServicoStatus[]) => vivos.filter((s) => sts.includes(s.status));
  switch (etapa) {
    case "novo":
      return "Montar o primeiro orçamento";
    case "concluido":
      return "Tudo pago";
    case "a_receber": {
      const s = primeiro(com(["executado"]));
      const v = valorDe(s);
      return v == null ? `Combinar o valor e receber o ${num(s.numero)}` : `Receber ${moeda(v)} do ${num(s.numero)}`;
    }
    case "fechado": {
      const s = primeiro(com(FECHADO), true);
      if (s.status === "agendado") {
        return s.data_prevista
          ? `Serviço ${num(s.numero)} agendado para ${diaMes(s.data_prevista)}`
          : `Serviço ${num(s.numero)} agendado`;
      }
      return s.data_prevista
        ? `Serviço ${num(s.numero)} confirmado para ${diaMes(s.data_prevista)}`
        : `Serviço ${num(s.numero)} confirmado, falta agendar`;
    }
    case "negociacao": {
      const aguardando = com(["aguardando_resposta"]);
      if (aguardando.length) return `Orçamento ${num(primeiro(aguardando).numero)} aguardando resposta`;
      const orcado = com(["orcado"]);
      if (orcado.length) return `Orçamento ${num(primeiro(orcado).numero)} pronto para enviar`;
      return `Serviço ${num(primeiro(com(["rascunho"])).numero)} em rascunho`;
    }
  }
}

export type ResumoCliente = {
  etapa: Etapa;
  /** Serviços nem pagos nem cancelados. */
  emAndamento: number;
  /** Soma dos executados (feitos e ainda não pagos). */
  emAberto: number;
  proximoPasso: string;
};

export function resumoCliente(servicos: ServicoListado[]): ResumoCliente {
  const vivos = servicos.filter((s) => s.status !== "cancelado");
  const etapa = etapaDoCliente(vivos);
  const emAberto = vivos
    .filter((s) => s.status === "executado")
    .reduce((soma, s) => soma + (valorDe(s) ?? 0), 0);
  return {
    etapa,
    emAndamento: vivos.filter((s) => s.status !== "pago").length,
    emAberto: Math.round(emAberto * 100) / 100,
    proximoPasso: proximoPasso(etapa, vivos),
  };
}

/** WhatsApp guardado sem o 55 → link do wa.me. Sem dígito nenhum, `null`. */
export function linkWhatsapp(whatsapp: string | null | undefined): string | null {
  const digitos = (whatsapp ?? "").replace(/\D/g, "");
  return digitos ? `https://wa.me/55${digitos}` : null;
}

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Busca por pedaço do nome, sem diferenciar acento nem maiúscula. */
export function filtrarPorNome<C extends Pick<Cliente, "nome">>(clientes: C[], q: string | null | undefined): C[] {
  const alvo = normalizar(q ?? "");
  if (!alvo) return clientes;
  return clientes.filter((c) => normalizar(c.nome).includes(alvo));
}

export type CartaoCliente = { cliente: Cliente; resumo: ResumoCliente };
export type ColunaQuadro = {
  etapa: Etapa;
  rotulo: string;
  cartoes: CartaoCliente[];
  /** Soma do em aberto dos cartões da coluna. */
  emAberto: number;
};

/** Uma coluna por etapa, na ordem do quadro, com os cartões em ordem de nome. */
export function montarQuadro(clientes: Cliente[], servicos: ServicoListado[]): ColunaQuadro[] {
  const porCliente = new Map<string, ServicoListado[]>();
  for (const s of servicos) {
    const lista = porCliente.get(s.cliente_id);
    if (lista) lista.push(s);
    else porCliente.set(s.cliente_id, [s]);
  }
  const cartoes = clientes
    .map((cliente) => ({ cliente, resumo: resumoCliente(porCliente.get(cliente.id) ?? []) }))
    .sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR"));
  return ETAPAS.map(({ etapa, rotulo }) => {
    const daColuna = cartoes.filter((c) => c.resumo.etapa === etapa);
    const emAberto = daColuna.reduce((soma, c) => soma + c.resumo.emAberto, 0);
    return { etapa, rotulo, cartoes: daColuna, emAberto: Math.round(emAberto * 100) / 100 };
  });
}
