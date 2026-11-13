// Cliente do modelo: o único arquivo que conhece o provedor (Featherless, API
// compatível com OpenAI). O resto do código fala com a interface `Llm`.
//
// Uma volta = uma chamada ao modelo. As ferramentas vão declaradas sem
// `execute` e sem laço interno do SDK (o padrão do `streamText` é um passo
// só): quem executa e decide se há outra volta é o nosso laço (loop.ts).
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  APICallError,
  generateText,
  jsonSchema,
  RetryError,
  streamText,
  tool,
  type FinishReason,
  type JSONSchema7,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { env } from "@/lib/env";
import type { Ferramenta } from "./ferramentas/definicoes";
import type { Chamada, Llm, Motivo } from "./tipos";

export const FEATHERLESS_URL = "https://api.featherless.ai/v1";

/**
 * Teto do histórico reenviado a cada volta. O modelo tem 32k tokens de
 * contexto; system e ferramentas levam uns 2,5k e a resposta precisa de
 * espaço. 40 mil caracteres ficam perto de 12k tokens em português.
 */
export const HISTORICO_PADRAO = { maxMensagens: 40, maxCaracteres: 40_000 };

export type LimiteHistorico = { maxMensagens: number; maxCaracteres: number };

export type OpcoesLlm = {
  /** `false` usa a chamada sem streaming e entrega o texto de uma vez em `aoTexto`. */
  streaming?: boolean;
  historico?: LimiteHistorico;
};

const tamanho = (m: ModelMessage) => JSON.stringify(m.content).length;

/**
 * As últimas mensagens inteiras que cabem no limite. O corte é sempre numa
 * mensagem do usuário: ela nunca fica entre uma chamada de ferramenta e o seu
 * resultado, e o histórico começa pelo usuário, como os modelos esperam.
 *
 * Se nem o turno atual (da última mensagem do usuário em diante) couber, ele
 * vai inteiro: cortar no meio deixaria chamada sem resultado. Sem nenhuma
 * mensagem do usuário, vai tudo.
 */
export function limitarHistorico(mensagens: ModelMessage[], limite: LimiteHistorico): ModelMessage[] {
  let corte = -1;
  let caracteres = 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    caracteres += tamanho(mensagens[i]);
    if (mensagens.length - i > limite.maxMensagens || caracteres > limite.maxCaracteres) break;
    if (mensagens[i].role === "user") corte = i;
  }
  if (corte === -1) corte = mensagens.findLastIndex((m) => m.role === "user");
  return corte <= 0 ? [...mensagens] : mensagens.slice(corte);
}

// O esquema vai como JSON Schema puro, sem validação no SDK: com o zod, o SDK
// barra a entrada inválida e inventa uma mensagem de resultado por conta
// própria. Quem valida e responde `entrada_invalida` é o executor (Task 8).
const esquemas = new WeakMap<Ferramenta, JSONSchema7>();

function esquemaJson(f: Ferramenta): JSONSchema7 {
  let s = esquemas.get(f);
  if (!s) {
    const json = z.toJSONSchema(f.esquema) as Record<string, unknown>;
    delete json.$schema; // só gasta contexto
    s = json as JSONSchema7;
    esquemas.set(f, s);
  }
  return s;
}

function ferramentasDoSdk(ferramentas: Ferramenta[]): ToolSet {
  return Object.fromEntries(
    ferramentas.map((f) => [f.nome, tool({ description: f.descricao, inputSchema: jsonSchema(esquemaJson(f)) })]),
  );
}

function motivo(finish: FinishReason, chamadas: number): Motivo {
  switch (finish) {
    case "tool-calls":
      return chamadas > 0 ? "ferramentas" : "outro";
    case "stop":
      // Há servidor compatível com OpenAI que responde `stop` mesmo pedindo
      // ferramenta; sem tratar, a chamada ficaria sem resultado no histórico.
      return chamadas > 0 ? "ferramentas" : "fim";
    case "length":
      return "limite";
    case "content-filter":
      return "filtro";
    default:
      return "outro";
  }
}

const uso = (u: LanguageModelUsage) => ({ entrada: u.inputTokens ?? 0, saida: u.outputTokens ?? 0 });

/** Erro já traduzido: a mensagem vai direto ao usuário (o laço a mostra como veio). */
export class ErroLlm extends Error {}

/** Qualquer erro → `ErroLlm` com mensagem em português (a causa fica em `cause`). */
export function traduzirErro(erro: unknown): ErroLlm {
  if (erro instanceof ErroLlm) return erro;
  const e = RetryError.isInstance(erro) ? erro.lastError : erro;
  let msg = "Não foi possível falar com o modelo agora. Tente de novo.";
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    if (status === 429) msg = "O modelo recebeu muitos pedidos ao mesmo tempo. Tente de novo em alguns segundos.";
    else if (status === 503) msg = "O modelo está sem capacidade agora. Tente de novo em alguns minutos.";
    else if (status === 401 || status === 403) msg = "A chave do modelo foi recusada. Confira a FEATHERLESS_API_KEY.";
    else if (status === 400 && /context|max_tokens/i.test(`${e.message} ${e.responseBody ?? ""}`))
      msg = "A conversa ficou longa demais para o modelo. Comece uma conversa nova.";
    else if (status === undefined) msg = "Não consegui falar com o modelo. Confira a conexão e tente de novo.";
    else msg = `O modelo respondeu com erro (${status}). Tente de novo.`;
  } else if (e instanceof TypeError || (e as { code?: string })?.code?.startsWith?.("E")) {
    // `fetch failed`, ECONNRESET, ENOTFOUND...
    msg = "Não consegui falar com o modelo. Confira a conexão e tente de novo.";
  }
  return new ErroLlm(msg, { cause: e });
}

type Resposta = {
  finishReason: FinishReason;
  usage: LanguageModelUsage;
  responseMessages: ModelMessage[];
  toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
};

/** O `Llm` sobre qualquer modelo do AI SDK. Nos testes, o modelo de mentira do SDK. */
export function llmComModelo(modelo: LanguageModel, opcoes: OpcoesLlm = {}): Llm {
  const streaming = opcoes.streaming ?? true;
  const limite = opcoes.historico ?? HISTORICO_PADRAO;

  return {
    async turno(req, aoTexto) {
      // Tudo que sai daqui vai ao usuário pelo laço: só erro em português.
      try {
        return await turno(req, aoTexto);
      } catch (e) {
        throw traduzirErro(e);
      }
    },

    resultado(itens) {
      return {
        role: "tool",
        content: itens.map((i) => ({
          type: "tool-result" as const,
          toolCallId: i.id,
          toolName: i.nome,
          output: i.erro ? { type: "error-text" as const, value: i.conteudo } : { type: "text" as const, value: i.conteudo },
        })),
      };
    },
  };

  async function turno(...[{ system, mensagens, ferramentas }, aoTexto]: Parameters<Llm["turno"]>) {
    const chamada = {
      model: modelo,
      instructions: system,
      messages: limitarHistorico(mensagens, limite),
      tools: ferramentasDoSdk(ferramentas),
    };

    let r: Resposta;
    if (streaming) {
      // O erro chega como parte `error` do stream (e as promessas depois
      // rejeitam sem detalhe): guarda o primeiro e relança traduzido.
      const s = streamText({ ...chamada, onError: () => {} });
      let erro: unknown;
      try {
        for await (const p of s.stream) {
          if (p.type === "text-delta") aoTexto(p.text);
          else if (p.type === "error") erro ??= p.error;
        }
        if (erro === undefined) {
          const [finishReason, usage, responseMessages, toolCalls] = await Promise.all([
            s.finishReason,
            s.usage,
            s.responseMessages,
            s.toolCalls,
          ]);
          r = { finishReason, usage, responseMessages, toolCalls };
        }
      } catch (e) {
        erro ??= e;
      }
      if (erro !== undefined) throw traduzirErro(erro);
    } else {
      let g;
      try {
        g = await generateText(chamada);
      } catch (e) {
        throw traduzirErro(e);
      }
      if (g.text) aoTexto(g.text);
      r = g;
    }

    // Chamada com entrada inválida (JSON quebrado) vem com o texto cru; o
    // executor responde `entrada_invalida` e o modelo tenta de novo.
    const chamadas: Chamada[] = r!.toolCalls.map((c) => ({ id: c.toolCallId, nome: c.toolName, entrada: c.input }));
    return {
      // Só o assistente: resultado de ferramenta quem monta é `resultado`.
      mensagens: r!.responseMessages.filter((m) => m.role === "assistant"),
      chamadas,
      motivo: motivo(r!.finishReason, chamadas.length),
      uso: uso(r!.usage),
    };
  }
}

/** Modelo da Featherless pelo id (`AGENTE_MODELO`). */
export function modeloFeatherless(apiKey: string, modeloId: string): LanguageModel {
  // Sem `includeUsage`: a doc da Featherless diz que o último pedaço do stream
  // já traz o `usage`. Se o uso vier zerado no smoke, ligar aqui.
  return createOpenAICompatible({ name: "featherless", baseURL: FEATHERLESS_URL, apiKey })(modeloId);
}

export function criarLlm(opcoes: OpcoesLlm = {}): Llm {
  return llmComModelo(modeloFeatherless(env.featherlessApiKey, env.agenteModelo), opcoes);
}
