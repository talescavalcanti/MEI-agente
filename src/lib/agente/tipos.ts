// Contrato entre o laço do agente (loop.ts) e o cliente do modelo (llm.ts).
// O laço só fala com a interface `Llm`; só o llm.ts conhece o provedor.

import type { ModelMessage } from "ai";
import type { Ferramenta } from "./ferramentas/definicoes";
import type { Cartao } from "./ferramentas/executar";

/** Chamada de ferramenta pedida pelo modelo numa volta. */
export type Chamada = { id: string; nome: string; entrada: unknown };

/**
 * Por que a volta do modelo terminou:
 * `fim` (respondeu), `ferramentas` (pediu ferramentas), `limite` (cortada por
 * tamanho), `filtro` (barrada por filtro de conteúdo), `outro` (resto).
 */
export type Motivo = "fim" | "ferramentas" | "limite" | "filtro" | "outro";

export interface Llm {
  /**
   * Uma volta do modelo. Devolve as mensagens novas do assistente (como o
   * provedor devolveu: o laço grava e reenvia sem alteração), as chamadas de
   * ferramenta, o motivo e o uso de tokens. Deltas de texto vão para `aoTexto`.
   */
  turno(
    req: { system: string; mensagens: ModelMessage[]; ferramentas: Ferramenta[] },
    aoTexto: (delta: string) => void,
  ): Promise<{
    mensagens: ModelMessage[];
    chamadas: Chamada[];
    motivo: Motivo;
    uso: { entrada: number; saida: number };
  }>;
  /** Monta a mensagem com os resultados das ferramentas de uma volta. */
  resultado(itens: { id: string; nome: string; conteudo: string; erro: boolean }[]): ModelMessage;
}

/**
 * Eventos do turno, na ordem em que acontecem. `erro` não encerra o turno:
 * `fim` sempre fecha o turno quando há conversa (também depois de `erro`),
 * trazendo o id dela.
 */
export type Evento =
  | { tipo: "texto"; delta: string }
  | { tipo: "ferramenta"; nome: string; erro: boolean }
  | { tipo: "cartao"; cartao: Cartao }
  | { tipo: "fim"; conversaId: string }
  | { tipo: "erro"; mensagem: string };
