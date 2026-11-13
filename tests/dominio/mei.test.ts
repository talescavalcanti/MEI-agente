import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { abrirBancoTeste, type BancoTeste } from "../helpers/banco";

// requireMei fala com o Supabase (`db.rpc`), com a sessão (`requireUser`) e
// com o `redirect` do Next. Aqui os três viram dublês: o `db.rpc` responde
// com o SQL de verdade no PGlite, no formato `{ data, error }` do supabase-js.
const h = vi.hoisted(() => ({
  banco: null as unknown as BancoTeste,
  user: null as null | { id: string; email: string; name: string; role: "admin" },
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
  async requireUser() {
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
}));

vi.mock("next/navigation", () => ({
  redirect(url: string): never {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { dadosDoFormulario, meiDoUsuario, requireMei, rpcDb, salvarMei } from "@/lib/dominio/mei";

let b: BancoTeste;

beforeAll(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
});
afterAll(() => b.fechar());

async function criarUsuario(): Promise<string> {
  const [u] = await b.q(
    `insert into public.users (email, name, password_hash) values ($1, 'Ana', 'teste') returning id`,
    [`${randomUUID()}@teste.local`],
  );
  return u.id;
}

beforeEach(() => {
  h.user = null;
});

describe("meiDoUsuario", () => {
  it("devolve null sem MEI e o MEI depois de salvo", async () => {
    const user = await criarUsuario();
    expect(await meiDoUsuario(b.rpc, user)).toBeNull();
    await b.rpc("mei_salvar", { p_user: user, p_dados: { nome: "Foto da Ana" } });
    expect(await meiDoUsuario(b.rpc, user)).toMatchObject({ user_id: user, nome: "Foto da Ana" });
  });

  it("linha toda nula (como o PostgREST devolve composto nulo) vira null", async () => {
    const rpc = async () => ({ id: null, user_id: null, nome: null });
    expect(await meiDoUsuario(rpc, "qualquer")).toBeNull();
  });
});

describe("salvarMei", () => {
  it("cria e depois atualiza", async () => {
    const user = await criarUsuario();
    const r1 = await salvarMei(b.rpc, user, { nome: "Zé Elétrica", atividade: "Eletricista" });
    expect(r1).toMatchObject({ ok: true, mei: { nome: "Zé Elétrica", atividade: "Eletricista" } });
    const r2 = await salvarMei(b.rpc, user, { cidade: "Goiânia" });
    expect(r2).toMatchObject({ ok: true, mei: { nome: "Zé Elétrica", cidade: "Goiânia" } });
  });

  it("erro 'regra:' do SQL vira mensagem amigável", async () => {
    const user = await criarUsuario();
    expect(await salvarMei(b.rpc, user, { cidade: "Goiânia" })).toEqual({
      ok: false,
      erro: "Informe o nome do negócio.",
    });
  });

  it("erro que não é regra vira mensagem genérica, sem vazar o texto do banco", async () => {
    const rpc = async () => {
      throw new Error("connection refused 10.0.0.1");
    };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await salvarMei(rpc, "u", { nome: "X" });
    erro.mockRestore();
    expect(r).toEqual({ ok: false, erro: "Não deu pra salvar agora. Tente de novo em instantes." });
  });
});

describe("dadosDoFormulario", () => {
  it("lê os cinco campos, com trim, e manda vazio como ausente", () => {
    const fd = new FormData();
    fd.set("nome", "  Zé  ");
    fd.set("atividade", "Eletricista");
    fd.set("cidade", "");
    fd.set("telefone", "62 99999-0000");
    fd.set("chave_pix", "   ");
    fd.set("user_id", "intruso");
    expect(dadosDoFormulario(fd)).toEqual({ nome: "Zé", atividade: "Eletricista", telefone: "62 99999-0000" });
  });
});

describe("rpcDb", () => {
  it("devolve o data e lança o error.message do Supabase, com o prefixo regra:", async () => {
    const user = await criarUsuario();
    await expect(rpcDb("mei_salvar", { p_user: user, p_dados: {} })).rejects.toThrow(
      /^regra: informe o nome do negócio$/,
    );
    expect(await rpcDb("mei_do_usuario", { p_user: user })).toBeNull();
  });
});

describe("requireMei", () => {
  it("sem sessão, segue o requireUser (login)", async () => {
    await expect(requireMei()).rejects.toThrow("REDIRECT:/login");
  });

  it("sem MEI, manda para /painel/negocio", async () => {
    h.user = { id: await criarUsuario(), email: "a@a", name: "Ana", role: "admin" };
    await expect(requireMei()).rejects.toThrow("REDIRECT:/painel/negocio");
  });

  it("com MEI, devolve usuário e MEI", async () => {
    const id = await criarUsuario();
    h.user = { id, email: "a@a", name: "Ana", role: "admin" };
    await b.rpc("mei_salvar", { p_user: id, p_dados: { nome: "Foto da Ana" } });
    const r = await requireMei();
    expect(r.user).toBe(h.user);
    expect(r.mei).toMatchObject({ user_id: id, nome: "Foto da Ana" });
  });
});
