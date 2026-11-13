import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

// `db.rpc` responde com o SQL no PGlite; a sessão é a dublê de `requireUserApi`.
const h = vi.hoisted(() => ({
  banco: null as unknown as BancoTeste,
  user: null as null | { id: string; email: string; name: string; role: "user" },
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

vi.mock("@/lib/auth/dal", () => ({
  PRIVATE_HEADERS: { "Cache-Control": "private, no-store, max-age=0, must-revalidate", Vary: "Cookie" },
  async requireUser() {
    throw new Error("não usar na rota");
  },
  async requireUserApi() {
    if (!h.user) return { ok: false, response: Response.json({ error: "Não autenticado." }, { status: 401 }) };
    return { ok: true, user: h.user };
  },
}));

import { GET } from "@/app/painel/documentos/contrato/[id]/pdf/route";

let b: BancoTeste;
let mei: string;
let contrato: string;
let userId: string;

beforeAll(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
}, 30_000);
afterAll(() => b.fechar());

beforeEach(async () => {
  mei = await criarMei(b, "Refrigeração Bueno");
  [{ user_id: userId }] = await b.q(`select user_id from public.meis where id = $1`, [mei]);
  h.user = { id: userId, email: "ze@teste.local", name: "Zé", role: "user" };
  const cliente = (await b.rpc("cliente_salvar", {
    p_mei: mei,
    p_dados: { nome: "Maria Conceição", endereco: "Rua 10, 200" },
  })) as { id: string };
  await b.rpc("cliente_documento_salvar", { p_mei: mei, p_cliente: cliente.id, p_documento: "529.982.247-25" });
  const servico = (await b.rpc("servico_registrar", {
    p_mei: mei,
    p_dados: { cliente_id: cliente.id, descricao: "Instalação de split", valor: 800 },
  })) as { id: string };
  const c = (await b.rpc("contrato_salvar", {
    p_mei: mei,
    p_servico: servico.id,
    p_minuta: "CLÁUSULA 1ª (DO OBJETO): Instalação de split.",
  })) as { id: string };
  contrato = c.id;
});

const pedir = (id: string) =>
  GET(new Request(`http://localhost/painel/documentos/contrato/${id}/pdf`), { params: Promise.resolve({ id }) });

describe("GET /painel/documentos/contrato/[id]/pdf", () => {
  it("devolve o PDF como anexo, com nome do serviço e do cliente sem acento", async () => {
    const r = await pedir(contrato);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="contrato-\d{3}-maria-conceicao\.pdf"$/);
    expect(r.headers.get("cache-control")).toContain("private");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("sem sessão: 401", async () => {
    h.user = null;
    expect((await pedir(contrato)).status).toBe(401);
  });

  it("id inválido ou inexistente: 404", async () => {
    expect((await pedir("nao-e-uuid")).status).toBe(404);
    expect((await pedir("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("contrato de outro MEI: 404", async () => {
    const outro = await criarMei(b, "Outro MEI");
    const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [outro]);
    h.user = { id: user_id, email: "outro@teste.local", name: "Outro", role: "user" };
    expect((await pedir(contrato)).status).toBe(404);
  });

  it("usuário sem negócio cadastrado: 404", async () => {
    const [u] = await b.q(
      `insert into public.users (email, name, password_hash) values ('sem-mei-' || gen_random_uuid() || '@t.local', 'Sem', 'x') returning id`,
    );
    h.user = { id: u.id, email: "sem@t.local", name: "Sem", role: "user" };
    expect((await pedir(contrato)).status).toBe(404);
  });
});
