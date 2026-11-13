import { APICallError, simulateReadableStream, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { FERRAMENTAS } from "@/lib/agente/ferramentas/definicoes";
import { criarLlm, limitarHistorico, llmComModelo } from "@/lib/agente/llm";

vi.mock("@/lib/env", () => ({
  env: { featherlessApiKey: "chave-falsa", agenteModelo: "google/gemma-4-31B-it" },
}));

// ---------------------------------------------------------------------------
// Histórico: função pura
// ---------------------------------------------------------------------------

const usuario = (t: string): ModelMessage => ({ role: "user", content: t });
const assistente = (t: string): ModelMessage => ({ role: "assistant", content: [{ type: "text", text: t }] });
const chamada = (id: string): ModelMessage => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: id, toolName: "buscar_cliente", input: { termo: "x" } }],
});
const resultado = (id: string): ModelMessage => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: id, toolName: "buscar_cliente", output: { type: "text", value: "[]" } }],
});

/** Toda chamada de ferramenta da lista tem resultado, e todo resultado tem chamada. */
function pareado(ms: ModelMessage[]): boolean {
  const chamadas = new Set<string>();
  const resultados = new Set<string>();
  for (const m of ms) {
    if (typeof m.content === "string") continue;
    for (const p of m.content) {
      if (p.type === "tool-call") chamadas.add(p.toolCallId);
      if (p.type === "tool-result") resultados.add(p.toolCallId);
    }
  }
  return [...chamadas].every((c) => resultados.has(c)) && [...resultados].every((r) => chamadas.has(r));
}

/** Turno com `voltas` chamadas de ferramenta: usuário, (chamada, resultado)×n, resposta. */
function turno(n: number, voltas: number): ModelMessage[] {
  const ms: ModelMessage[] = [usuario(`pedido ${n}`)];
  for (let v = 0; v < voltas; v++) ms.push(chamada(`c${n}-${v}`), resultado(`c${n}-${v}`));
  ms.push(assistente(`resposta ${n}`));
  return ms;
}

describe("limitarHistorico", () => {
  it("dentro do limite, devolve tudo igual", () => {
    const ms = [...turno(1, 1), ...turno(2, 0)];
    expect(limitarHistorico(ms, { maxMensagens: 40, maxCaracteres: 100_000 })).toEqual(ms);
  });

  it("corta só em mensagem do usuário, nunca entre chamada e resultado", () => {
    const ms = Array.from({ length: 10 }, (_, i) => turno(i, 2)).flat(); // 6 mensagens por turno
    for (let max = 1; max <= ms.length; max++) {
      const r = limitarHistorico(ms, { maxMensagens: max, maxCaracteres: 1_000_000 });
      expect(r[0].role, `max ${max}`).toBe("user");
      expect(pareado(r), `max ${max}`).toBe(true);
      expect(r).toEqual(ms.slice(ms.length - r.length)); // sufixo, sem alteração
      if (max >= 6) expect(r.length).toBeLessThanOrEqual(max);
    }
  });

  it("respeita o limite de caracteres", () => {
    const grande = "x".repeat(1000);
    const ms = [usuario(grande), assistente("a"), usuario(grande), assistente("b"), usuario("curto"), assistente("c")];
    const r = limitarHistorico(ms, { maxMensagens: 40, maxCaracteres: 1500 });
    expect(r).toEqual(ms.slice(2));
  });

  it("turno atual maior que o limite fica inteiro, a partir da mensagem do usuário", () => {
    const ms = [...turno(1, 0), ...turno(2, 5)];
    const r = limitarHistorico(ms, { maxMensagens: 3, maxCaracteres: 1_000_000 });
    expect(r).toEqual(turno(2, 5));
  });

  it("no meio do turno (último é resultado de ferramenta) mantém o turno inteiro", () => {
    const atual = [usuario("agora"), chamada("z1"), resultado("z1")];
    const ms = [...turno(1, 1), ...atual];
    const r = limitarHistorico(ms, { maxMensagens: 2, maxCaracteres: 1_000_000 });
    expect(r).toEqual(atual);
    expect(pareado(r)).toBe(true);
  });

  it("sem mensagem do usuário, devolve tudo (não tem onde cortar com segurança)", () => {
    const ms = [chamada("a"), resultado("a"), assistente("ok")];
    expect(limitarHistorico(ms, { maxMensagens: 1, maxCaracteres: 10 })).toEqual(ms);
  });
});

// ---------------------------------------------------------------------------
// turno e resultado, com o modelo de mentira do AI SDK
// ---------------------------------------------------------------------------

type Parte = Record<string, unknown>;

const uso = (entrada: number, saida: number) => ({
  inputTokens: { total: entrada, noCache: entrada, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: saida, text: saida, reasoning: undefined },
});

const fim = (motivo: string, entrada = 100, saida = 20): Parte => ({
  type: "finish",
  finishReason: { unified: motivo, raw: motivo },
  usage: uso(entrada, saida),
});

const texto = (...deltas: string[]): Parte[] => [
  { type: "text-start", id: "t" },
  ...deltas.map((delta) => ({ type: "text-delta", id: "t", delta })),
  { type: "text-end", id: "t" },
];

const ferramenta = (id: string, nome: string, input: string): Parte => ({
  type: "tool-call",
  toolCallId: id,
  toolName: nome,
  input,
});

/** Modelo que responde as partes dadas (streaming) ou o conteúdo equivalente (sem streaming). */
function modelo(partes: Parte[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: partes as never }) }),
    doGenerate: async () => {
      const textoTodo = partes.filter((p) => p.type === "text-delta").map((p) => p.delta).join("");
      const content = [
        ...(textoTodo ? [{ type: "text", text: textoTodo }] : []),
        ...partes.filter((p) => p.type === "tool-call"),
      ];
      const f = partes.find((p) => p.type === "finish")!;
      return { content, finishReason: f.finishReason, usage: f.usage, warnings: [] } as never;
    },
  });
}

const req = (mensagens: ModelMessage[] = [usuario("oi")]) => ({
  system: "Você é o assistente.",
  mensagens,
  ferramentas: FERRAMENTAS,
});

describe.each([true, false])("llmComModelo (streaming: %s)", (streaming) => {
  it("texto: deltas vão para aoTexto, motivo fim, uso somado, só mensagens do assistente", async () => {
    const m = modelo([...texto("Olá", ", tudo ", "bem?"), fim("stop", 120, 7)]);
    const deltas: string[] = [];
    const r = await llmComModelo(m, { streaming }).turno(req(), (d) => deltas.push(d));
    expect(deltas.join("")).toBe("Olá, tudo bem?");
    if (streaming) expect(deltas.length).toBe(3);
    expect(r.motivo).toBe("fim");
    expect(r.uso).toEqual({ entrada: 120, saida: 7 });
    expect(r.chamadas).toEqual([]);
    expect(r.mensagens).toEqual([{ role: "assistant", content: [{ type: "text", text: "Olá, tudo bem?" }] }]);
  });

  it("ferramentas: chamadas devolvidas, nada executado, uma chamada ao modelo só", async () => {
    const m = modelo([
      ferramenta("c1", "buscar_cliente", '{"termo":"maria"}'),
      ferramenta("c2", "listar_servicos", "{}"),
      fim("tool-calls"),
    ]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.motivo).toBe("ferramentas");
    expect(r.chamadas).toEqual([
      { id: "c1", nome: "buscar_cliente", entrada: { termo: "maria" } },
      { id: "c2", nome: "listar_servicos", entrada: {} },
    ]);
    expect(r.mensagens.every((x) => x.role === "assistant")).toBe(true);
    const calls = streaming ? m.doStreamCalls : m.doGenerateCalls;
    expect(calls).toHaveLength(1);
    // As 16 ferramentas chegam ao provedor como funções, com o esquema em JSON Schema.
    const tools = calls[0].tools as { type: string; name: string; inputSchema: { properties?: object } }[];
    expect(tools.map((t) => t.name)).toEqual(FERRAMENTAS.map((f) => f.nome));
    expect(tools.every((t) => t.type === "function" && t.inputSchema.properties)).toBe(true);
  });

  it("entrada fora do esquema não é barrada pelo SDK: o executor é quem valida", async () => {
    const m = modelo([ferramenta("c1", "registrar_servico", '{"descricao":"x"}'), fim("tool-calls")]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.chamadas).toEqual([{ id: "c1", nome: "registrar_servico", entrada: { descricao: "x" } }]);
    expect(r.mensagens.map((x) => x.role)).toEqual(["assistant"]);
  });

  it("JSON quebrado vira chamada com o texto cru e nenhuma mensagem de resultado inventada", async () => {
    const m = modelo([ferramenta("c1", "buscar_cliente", '{"termo":'), fim("tool-calls")]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.chamadas).toEqual([{ id: "c1", nome: "buscar_cliente", entrada: '{"termo":' }]);
    expect(r.mensagens.map((x) => x.role)).toEqual(["assistant"]);
    expect(r.motivo).toBe("ferramentas");
  });

  it.each([
    ["length", "limite"],
    ["content-filter", "filtro"],
    ["error", "outro"],
    ["other", "outro"],
  ])("finishReason %s → %s", async (finish, motivo) => {
    const m = modelo([...texto("parcial"), fim(finish)]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.motivo).toBe(motivo);
  });

  it("stop com chamadas conta como ferramentas (há servidor que responde assim)", async () => {
    const m = modelo([ferramenta("c1", "listar_servicos", "{}"), fim("stop")]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.motivo).toBe("ferramentas");
  });

  it("tool-calls sem nenhuma chamada vira outro", async () => {
    const m = modelo([...texto("hmm"), fim("tool-calls")]);
    const r = await llmComModelo(m, { streaming }).turno(req(), () => {});
    expect(r.motivo).toBe("outro");
  });

  it("histórico longo é cortado antes de ir ao modelo", async () => {
    const m = modelo([...texto("ok"), fim("stop")]);
    const longo = Array.from({ length: 30 }, (_, i) => turno(i, 1)).flat(); // 120 mensagens
    await llmComModelo(m, { streaming, historico: { maxMensagens: 10, maxCaracteres: 1_000_000 } }).turno(
      req(longo),
      () => {},
    );
    const prompt = (streaming ? m.doStreamCalls : m.doGenerateCalls)[0].prompt as { role: string }[];
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
    expect(prompt.length - 1).toBeLessThanOrEqual(10);
  });
});

describe("erros do provedor", () => {
  const falha = (erro: unknown) =>
    new MockLanguageModelV4({
      doStream: async () => {
        throw erro;
      },
      doGenerate: async () => {
        throw erro;
      },
    });
  const limite = new APICallError({
    message: "Too Many Requests",
    url: "https://api.featherless.ai/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: false,
  });

  it.each([true, false])("429 vira mensagem em português (streaming: %s)", async (streaming) => {
    const p = llmComModelo(falha(limite), { streaming }).turno(req(), () => {});
    await expect(p).rejects.toThrow(/muitos pedidos ao mesmo tempo/i);
  });

  it("falha de rede vira mensagem em português", async () => {
    const p = llmComModelo(falha(new TypeError("fetch failed")), { streaming: true }).turno(req(), () => {});
    await expect(p).rejects.toThrow(/não consegui falar com o modelo/i);
  });

  it("outro erro do provedor também sai em português, com a causa preservada", async () => {
    const erro = new APICallError({
      message: "boom",
      url: "u",
      requestBodyValues: {},
      statusCode: 500,
      isRetryable: false,
    });
    const p = llmComModelo(falha(erro), { streaming: true }).turno(req(), () => {});
    await expect(p).rejects.toMatchObject({ message: expect.stringMatching(/modelo/), cause: erro });
  });
});

describe("resultado", () => {
  it("monta uma mensagem tool com todos os resultados, erro como error-text", () => {
    const m = llmComModelo(modelo([])).resultado([
      { id: "c1", nome: "buscar_cliente", conteudo: "[]", erro: false },
      { id: "c2", nome: "gerar_orcamento", conteudo: '{"erro":"serviço não encontrado"}', erro: true },
    ]);
    expect(m).toEqual({
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: "c1", toolName: "buscar_cliente", output: { type: "text", value: "[]" } },
        {
          type: "tool-result",
          toolCallId: "c2",
          toolName: "gerar_orcamento",
          output: { type: "error-text", value: '{"erro":"serviço não encontrado"}' },
        },
      ],
    });
  });

  it("o resultado volta para o modelo pareado com a chamada", async () => {
    const m = modelo([...texto("ok"), fim("stop")]);
    const llm = llmComModelo(m);
    const historico = [usuario("oi"), chamada("c1"), llm.resultado([{ id: "c1", nome: "buscar_cliente", conteudo: "[]", erro: false }])];
    await llm.turno(req(historico), () => {});
    const prompt = m.doStreamCalls[0].prompt as { role: string }[];
    expect(prompt.map((p) => p.role)).toEqual(["system", "user", "assistant", "tool"]);
  });
});

describe("criarLlm", () => {
  it("monta o cliente da Featherless a partir do env, sem chamar nada", () => {
    const llm = criarLlm();
    expect(typeof llm.turno).toBe("function");
    expect(typeof llm.resultado).toBe("function");
  });
});
