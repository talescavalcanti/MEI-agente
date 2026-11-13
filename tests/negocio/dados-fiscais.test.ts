import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

// Mesmas dublês das outras actions: `db.rpc` responde com o SQL no PGlite.
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

vi.mock("next/cache", () => ({ revalidatePath() {} }));

import { salvarDadosFiscais } from "@/app/painel/negocio/actions";

let b: BancoTeste;
let mei: string;

beforeAll(async () => {
  b = await abrirBancoTeste();
  h.banco = b;
}, 30_000);
afterAll(() => b.fechar());

beforeEach(async () => {
  mei = await criarMei(b, "Refrigeração Bueno");
  const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [mei]);
  h.user = { id: user_id, email: "ze@teste.local", name: "Zé", role: "user" };
});

const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

const fiscais = async () =>
  (
    await b.q(
      `select cnpj, inscricao_municipal, municipio, codigo_tributacao, nbs, descricao_padrao_nota from public.meis where id = $1`,
      [mei],
    )
  )[0];

describe("salvarDadosFiscais", () => {
  it("grava os dados fiscais normalizados", async () => {
    const r = await salvarDadosFiscais(
      undefined,
      form({
        cnpj: "11.222.333/0001-81",
        inscricao_municipal: "12345",
        municipio: "Goiânia",
        codigo_tributacao: "14.01.01",
        nbs: "1.2001.81.00",
        descricao_padrao_nota: "Manutenção de ar-condicionado",
        user_id: "intruso",
      }),
    );
    expect(r).toEqual({ salvo: true });
    expect(await fiscais()).toEqual({
      cnpj: "11222333000181",
      inscricao_municipal: "12345",
      municipio: "Goiânia",
      codigo_tributacao: "140101",
      nbs: "120018100",
      descricao_padrao_nota: "Manutenção de ar-condicionado",
    });
  });

  it("CNPJ com dígito errado ou CPF no lugar do CNPJ é barrado antes do banco", async () => {
    expect(await salvarDadosFiscais(undefined, form({ cnpj: "11.222.333/0001-82" }))).toEqual({
      error: "CNPJ do negócio inválido.",
    });
    expect(await salvarDadosFiscais(undefined, form({ cnpj: "529.982.247-25" }))).toEqual({
      error: "CNPJ do negócio inválido.",
    });
    expect((await fiscais()).cnpj).toBeNull();
  });

  it("erro 'regra:' do SQL vira frase amigável", async () => {
    expect(await salvarDadosFiscais(undefined, form({ codigo_tributacao: "1401" }))).toEqual({
      error: "Código de tributação nacional inválido (use 6 dígitos, ex.: 14.01.01).",
    });
  });

  it("CNPJ alfanumérico é aceito", async () => {
    expect(await salvarDadosFiscais(undefined, form({ cnpj: "12.abc.345/01de-35" }))).toEqual({ salvo: true });
    expect((await fiscais()).cnpj).toBe("12ABC34501DE35");
  });

  it("sem sessão, redireciona para o login", async () => {
    h.user = null;
    await expect(salvarDadosFiscais(undefined, form({ municipio: "Goiânia" }))).rejects.toThrow("REDIRECT:/login");
  });
});
