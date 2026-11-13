import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

// A rota de verdade, com dublês só nas bordas: o `db.rpc` responde com o SQL
// de verdade no PGlite (formato `{ data, error }` do supabase-js) e o env é um
// objeto que cada teste ajusta.
const h = vi.hoisted(() => ({
  banco: null as unknown as import("../helpers/banco").BancoTeste,
  env: { metaAppSecret: "", metaWebhookVerifyToken: "" },
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

vi.mock("@/lib/env", () => ({ env: h.env }));

const { GET, POST } = await import("@/app/api/meta/webhook/route");

const SEGREDO = "segredo-do-app";
const TOKEN = "token-de-verificacao";
const IG = "17841429113044909";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
  h.env.metaAppSecret = SEGREDO;
  h.env.metaWebhookVerifyToken = TOKEN;
}, 30_000);

afterEach(async () => {
  await b.fechar();
  vi.restoreAllMocks();
});

function handshake(params: Record<string, string>): Promise<Response> {
  const url = new URL("http://localhost/api/meta/webhook");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return GET(new Request(url));
}

const assinar = (corpo: string, segredo = SEGREDO) =>
  "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

function enviar(corpo: unknown, assinatura?: string | null): Promise<Response> {
  const cru = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sig = assinatura === undefined ? assinar(cru) : assinatura;
  if (sig !== null) headers["X-Hub-Signature-256"] = sig;
  return POST(new Request("http://localhost/api/meta/webhook", { method: "POST", headers, body: cru }));
}

const dm = (mid: string, texto: string, conta = IG) => ({
  object: "instagram",
  entry: [
    {
      id: conta,
      time: 1763035200000,
      messaging: [{ sender: { id: "IGSID-1" }, recipient: { id: conta }, timestamp: 1763035200000, message: { mid, text: texto } }],
    },
  ],
});

const recebidas = () => b.q(`select mei_id, canal, conta_id, remetente_id, externo_id, conteudo, tipo from public.mensagens_recebidas`);

describe("GET /api/meta/webhook: handshake", () => {
  it("devolve o challenge em texto quando o token bate", async () => {
    const res = await handshake({ "hub.mode": "subscribe", "hub.verify_token": TOKEN, "hub.challenge": "1158201444" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("1158201444");
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("token errado ou modo errado responde 403", async () => {
    expect((await handshake({ "hub.mode": "subscribe", "hub.verify_token": "outro", "hub.challenge": "1" })).status).toBe(403);
    expect((await handshake({ "hub.mode": "unsubscribe", "hub.verify_token": TOKEN, "hub.challenge": "1" })).status).toBe(403);
    expect((await handshake({})).status).toBe(403);
  });

  it("sem token configurado responde 403, até para token vazio", async () => {
    h.env.metaWebhookVerifyToken = "";
    expect((await handshake({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" })).status).toBe(403);
  });
});

describe("POST /api/meta/webhook: recusas", () => {
  it("sem App Secret configurado responde 503 e não grava nada", async () => {
    h.env.metaAppSecret = "";
    const res = await enviar(dm("mid-1", "oi"), assinar(JSON.stringify(dm("mid-1", "oi")), ""));
    expect(res.status).toBe(503);
    expect(await recebidas()).toHaveLength(0);
  });

  it("assinatura errada ou ausente responde 401", async () => {
    const mei = await criarMei(b);
    await b.rpc("canal_conectar", { p_mei: mei, p_canal: "instagram", p_conta: IG });
    expect((await enviar(dm("mid-1", "oi"), assinar("outro corpo"))).status).toBe(401);
    expect((await enviar(dm("mid-1", "oi"), null)).status).toBe(401);
    expect(await recebidas()).toHaveLength(0);
  });

  it("JSON quebrado com assinatura válida responde 400", async () => {
    expect((await enviar("{oi")).status).toBe(400);
  });
});

describe("POST /api/meta/webhook: mensagens", () => {
  it("grava a mensagem no MEI ligado à conta e responde EVENT_RECEIVED", async () => {
    const mei = await criarMei(b);
    await b.rpc("canal_conectar", { p_mei: mei, p_canal: "instagram", p_conta: IG });

    const res = await enviar(dm("mid-1", "Vocês atendem sábado?"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
    expect(await recebidas()).toEqual([
      {
        mei_id: mei,
        canal: "instagram",
        conta_id: IG,
        remetente_id: "IGSID-1",
        externo_id: "mid-1",
        conteudo: "Vocês atendem sábado?",
        tipo: "texto",
      },
    ]);
  });

  it("grava mensagem do WhatsApp pelo phone_number_id", async () => {
    const mei = await criarMei(b);
    await b.rpc("canal_conectar", { p_mei: mei, p_canal: "whatsapp", p_conta: "PNID" });
    const res = await enviar({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PNID" },
                contacts: [{ profile: { name: "Maria" }, wa_id: "5581988887777" }],
                messages: [{ from: "5581988887777", id: "wamid.1", timestamp: "1763035200", type: "text", text: { body: "Bom dia!" } }],
              },
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    const [m] = await b.q(`select mei_id, canal, remetente_nome, conteudo from public.mensagens_recebidas`);
    expect(m).toEqual({ mei_id: mei, canal: "whatsapp", remetente_nome: "Maria", conteudo: "Bom dia!" });
  });

  it("conta não ligada a nenhum MEI é ignorada com 200", async () => {
    const res = await enviar(dm("mid-1", "oi", "conta-solta"));
    expect(res.status).toBe(200);
    expect(await recebidas()).toHaveLength(0);
  });

  it("reenvio do mesmo evento não duplica", async () => {
    const mei = await criarMei(b);
    await b.rpc("canal_conectar", { p_mei: mei, p_canal: "instagram", p_conta: IG });
    expect((await enviar(dm("mid-1", "oi"))).status).toBe(200);
    expect((await enviar(dm("mid-1", "oi"))).status).toBe(200);
    expect(await recebidas()).toHaveLength(1);
  });

  it("erro do banco é logado e a resposta continua 200", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    // Sem a função no banco, toda chamada falha.
    await b.q(`drop function public.mensagem_recebida_registrar(text, jsonb)`);
    const res = await enviar(dm("mid-1", "oi"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
    expect(erro).toHaveBeenCalled();
  });
});
