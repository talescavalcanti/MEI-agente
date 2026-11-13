// LLM falso para os testes do laço: segue um roteiro, uma volta por passo, e
// guarda tudo o que recebeu. Monta as mensagens no formato do AI SDK
// (ModelMessage), como o llm.ts de verdade faz.
import type { ModelMessage } from "ai";
import type { Ferramenta } from "@/lib/agente/ferramentas/definicoes";
import type { Chamada, Llm, Motivo } from "@/lib/agente/tipos";

export type Passo = {
  /** Texto do assistente; vai para `aoTexto` em pedaços. */
  texto?: string;
  /** Chamadas de ferramenta; sem `id`, ganha `chamada-<volta>-<i>`. */
  chamadas?: { nome: string; entrada: unknown; id?: string }[];
  /** Padrão: `ferramentas` se houver chamadas, senão `fim`. */
  motivo?: Motivo;
  /** Padrão: 10 de entrada e 5 de saída. */
  uso?: { entrada: number; saida: number };
  /** Partes a mais no `content` do assistente (que o laço não entende). */
  extras?: unknown[];
  /** Campos a mais na mensagem do assistente (ex.: `providerOptions`). */
  campos?: Record<string, unknown>;
  /** A volta lança este erro em vez de responder. */
  lancar?: Error;
};

export type Pedido = { system: string; mensagens: ModelMessage[]; ferramentas: Ferramenta[] };

export type LlmFalso = Llm & {
  /** O que cada volta recebeu (mensagens em cópia profunda). */
  pedidos: Pedido[];
  /** Mensagens que cada volta devolveu (as mesmas referências). */
  devolvidas: ModelMessage[][];
};

export function llmFalso(roteiro: Passo[] | ((volta: number) => Passo)): LlmFalso {
  const pedidos: Pedido[] = [];
  const devolvidas: ModelMessage[][] = [];

  return {
    pedidos,
    devolvidas,

    async turno(req, aoTexto) {
      pedidos.push({ ...req, mensagens: structuredClone(req.mensagens) });
      const volta = pedidos.length;
      const passo = typeof roteiro === "function" ? roteiro(volta) : roteiro[volta - 1];
      if (!passo) throw new Error(`roteiro acabou na volta ${volta}`);
      if (passo.lancar) throw passo.lancar;

      const chamadas: Chamada[] = (passo.chamadas ?? []).map((c, i) => ({
        id: c.id ?? `chamada-${volta}-${i + 1}`,
        nome: c.nome,
        entrada: c.entrada,
      }));

      if (passo.texto) {
        const meio = Math.ceil(passo.texto.length / 2);
        aoTexto(passo.texto.slice(0, meio));
        if (passo.texto.length > meio) aoTexto(passo.texto.slice(meio));
      }

      const mensagem = {
        role: "assistant",
        content: [
          ...(passo.texto ? [{ type: "text", text: passo.texto }] : []),
          ...chamadas.map((c) => ({ type: "tool-call", toolCallId: c.id, toolName: c.nome, input: c.entrada })),
          ...(passo.extras ?? []),
        ],
        ...passo.campos,
      } as ModelMessage;
      devolvidas.push([mensagem]);

      return {
        mensagens: [mensagem],
        chamadas,
        motivo: passo.motivo ?? (chamadas.length ? "ferramentas" : "fim"),
        uso: passo.uso ?? { entrada: 10, saida: 5 },
      };
    },

    resultado(itens) {
      return {
        role: "tool",
        content: itens.map((i) => ({
          type: "tool-result",
          toolCallId: i.id,
          toolName: i.nome,
          output: i.erro ? { type: "error-text", value: i.conteudo } : { type: "text", value: i.conteudo },
        })),
      };
    },
  };
}
