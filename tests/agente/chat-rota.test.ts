import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Evento } from "@/lib/agente/tipos";
import { abrirBancoTeste, type BancoTeste } from "../helpers/banco";
import { llmFalso, type LlmFalso, type Passo } from "../helpers/llm-falso";

// A rota de verdade, com dublês só nas bordas: o `db.rpc` responde com o SQL
// de verdade no PGlite (formato `{ data, error }` do supabase-js), a sessão
// vem de `h.user` e o modelo é o LLM falso.
const h = vi.hoisted(() => ({
  banco: null as unknown as import("../helpers/banco").BancoTeste,
  user: null as null | { id: string; email: string; name: string; role: "admin" },
  llm: null as unknown as import("../helpers/llm-falso").LlmFalso,
}));

vi.mock("@/lib/supabase", () => ({
  db: {
    async rpc(nome: string, args: Record<string, unknown>) {
      try {
        return { data: await h.banco.rpc(nome, args), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  },
}));

vi.mock("@/lib/auth/dal", () => {
  const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate", Vary: "Cookie" };
  return {
    PRIVATE_HEADERS,
    async requireUser() {
      if (!h.user) throw new Error("REDIRECT:/login");
      return h.user;
    },
    async requireUserApi() {
      if (!h.user) {
        return { ok: false, response: Response.json({ error: "Não autenticado." }, { status: 401, headers: PRIVATE_HEADERS }) };
      }
      return { ok: true, user: h.user };
    },
  };
});

vi.mock("@/lib/env", () => ({
  env: { featherlessApiKey: "chave-falsa", agenteModelo: "modelo-falso", limiteDiarioTokens: 400_000 },
}));

vi.mock("@/lib/agente/llm", () => ({ criarLlm: () => h.llm }));

const { POST } = await import("@/app/api/chat/route");

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
  h.user = null;
  h.llm = llmFalso([{ texto: "Olá! Como posso ajudar?" }]);
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

async function criarUsuario(nome = "Tales"): Promise<{ id: string; email: string; name: string; role: "admin" }> {
  const email = `${randomUUID()}@teste.local`;
  const [u] = await b.q(`insert into public.users (email, name, password_hash) values ($1, $2, 'x') returning id`, [
    email,
    nome,
  ]);
  return { id: u.id, email, name: nome, role: "admin" };
}

async function logarComMei(): Promise<string> {
  h.user = await criarUsuario();
  const mei = (await b.rpc("mei_salvar", {
    p_user: h.user.id,
    p_dados: { nome: "Refrigeração Bueno", atividade: "Técnico de manutenção", cidade: "Goiânia" },
  })) as { id: string };
  return mei.id;
}

function pedir(corpo: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
}

async function eventos(res: Response): Promise<Evento[]> {
  const texto = await res.text();
  return texto
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Evento);
}

describe("POST /api/chat: recusas", () => {
  it("sem sessão responde 401 e não chama o modelo", async () => {
    const res = await pedir({ conversaId: null, texto: "oi" });
    expect(res.status).toBe(401);
    expect(h.llm.pedidos).toHaveLength(0);
  });

  it.each([
    ["texto vazio", { conversaId: null, texto: "   " }],
    ["texto longo demais", { conversaId: null, texto: "a".repeat(4001) }],
    ["texto que não é texto", { conversaId: null, texto: 42 }],
    ["conversaId que não é uuid", { conversaId: "abc", texto: "oi" }],
    ["corpo que não é objeto", ["oi"]],
    ["JSON quebrado", "{oi"],
  ])("%s responde 400", async (_nome, corpo) => {
    await logarComMei();
    const res = await pedir(corpo);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(h.llm.pedidos).toHaveLength(0);
  });

  it("texto com exatamente 4000 caracteres passa", async () => {
    await logarComMei();
    const res = await pedir({ conversaId: null, texto: "a".repeat(4000) });
    expect(res.status).toBe(200);
  });

  it("usuário sem MEI responde 409", async () => {
    h.user = await criarUsuario();
    const res = await pedir({ conversaId: null, texto: "oi" });
    expect(res.status).toBe(409);
    expect(h.llm.pedidos).toHaveLength(0);
  });
});

describe("POST /api/chat: turno", () => {
  it("responde em NDJSON, um evento por linha, e termina com fim", async () => {
    await logarComMei();
    const res = await pedir({ conversaId: null, texto: "oi" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Vary")).toBe("Cookie");

    const evs = await eventos(res);
    expect(evs.filter((e) => e.tipo === "texto").map((e) => (e as { delta: string }).delta).join("")).toBe(
      "Olá! Como posso ajudar?",
    );
    const fim = evs.at(-1) as Extract<Evento, { tipo: "fim" }>;
    expect(fim.tipo).toBe("fim");
    expect(fim.conversaId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("prefixa o contexto do negócio ao texto, e o título da conversa é o texto do usuário", async () => {
    const mei = await logarComMei();
    await b.rpc("memoria_salvar", { p_mei: mei, p_fato: "Cobra 50% de sinal" });

    const evs = await eventos(await pedir({ conversaId: null, texto: "Orçamento do Carlos" }));
    const { conversaId } = evs.at(-1) as Extract<Evento, { tipo: "fim" }>;

    const enviado = h.llm.pedidos[0].mensagens.at(-1)!;
    expect(enviado.role).toBe("user");
    const conteudo = enviado.content as string;
    expect(conteudo.startsWith("<contexto_do_negocio>")).toBe(true);
    expect(conteudo).toMatch(/Hoje: \d{4}-\d{2}-\d{2}/);
    expect(conteudo).toContain("Técnico de manutenção");
    expect(conteudo).toContain("Cobra 50% de sinal");
    expect(conteudo.endsWith("Orçamento do Carlos")).toBe(true);

    const [c] = await b.q(`select titulo, origem, mei_id from public.conversas where id = $1`, [conversaId]);
    expect(c).toEqual({ titulo: "Orçamento do Carlos", origem: "chat", mei_id: mei });
  });

  it("continua a mesma conversa quando recebe o conversaId", async () => {
    await logarComMei();
    h.llm = llmFalso([{ texto: "Oi!" }, { texto: "Tudo certo." }]);
    const primeiro = await eventos(await pedir({ conversaId: null, texto: "oi" }));
    const { conversaId } = primeiro.at(-1) as Extract<Evento, { tipo: "fim" }>;

    const segundo = await eventos(await pedir({ conversaId, texto: "e aí?" }));
    expect(segundo.at(-1)).toEqual({ tipo: "fim", conversaId });

    const [{ n }] = await b.q(`select count(*)::int as n from public.conversa_mensagens where conversa_id = $1`, [
      conversaId,
    ]);
    expect(n).toBe(4);
    expect(h.llm.pedidos[1].mensagens).toHaveLength(3);
  });

  it("ferramenta e cartão chegam como eventos; regra do SQL chega com a frase", async () => {
    await logarComMei();
    const roteiro: Passo[] = [
      {
        chamadas: [
          { nome: "criar_ou_atualizar_cliente", entrada: { nome: "Carlos", whatsapp: "62 9 9999-0000" } },
          { nome: "gerar_orcamento", entrada: { servico_id: randomUUID() } },
        ],
      },
      { texto: "Cadastrei o Carlos." },
    ];
    h.llm = llmFalso(roteiro);

    const evs = await eventos(await pedir({ conversaId: null, texto: "cadastra o Carlos" }));
    expect(evs.filter((e) => e.tipo === "ferramenta")).toEqual([
      { tipo: "ferramenta", nome: "criar_ou_atualizar_cliente", erro: false },
      { tipo: "ferramenta", nome: "gerar_orcamento", erro: true },
    ]);
    // O resultado com erro voltou ao modelo com a frase da regra, sem o prefixo cru do banco.
    const resultado = JSON.stringify(h.llm.pedidos[1].mensagens.at(-1));
    expect(resultado).toContain("não encontrado");
    expect(evs.at(-1)!.tipo).toBe("fim");
  });

  it("conversa de outro MEI vira erro no stream, sem fim e sem gravar nada", async () => {
    // Conversa do MEI A.
    await logarComMei();
    const a = await eventos(await pedir({ conversaId: null, texto: "oi" }));
    const { conversaId } = a.at(-1) as Extract<Evento, { tipo: "fim" }>;

    // O MEI B tenta usar a conversa do A.
    await logarComMei();
    h.llm = llmFalso([{ texto: "não devia" }]);
    const res = await pedir({ conversaId, texto: "oi" });
    expect(res.status).toBe(200);
    const evs = await eventos(res);
    expect(evs.map((e) => e.tipo)).toEqual(["erro"]);
    expect(h.llm.pedidos).toHaveLength(0);
  });

  it("modelo que falha vira evento de erro e o stream fecha com fim", async () => {
    await logarComMei();
    h.llm = llmFalso([{ lancar: new Error("O modelo está sem capacidade agora. Tente de novo em alguns minutos.") }]);
    const evs = await eventos(await pedir({ conversaId: null, texto: "oi" }));
    expect(evs.map((e) => e.tipo)).toEqual(["erro", "fim"]);
    expect((evs[0] as { mensagem: string }).mensagem).toContain("sem capacidade");
  });
});

// Deixa o tipo importado em uso mesmo se algum teste acima mudar.
export type { LlmFalso };
