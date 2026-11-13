import { beforeEach, describe, expect, it, vi } from "vitest";

type UsuarioMock = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "user";
};

const h = vi.hoisted(() => ({
  usuarios: [] as UsuarioMock[],
  sessaoCriada: null as null | { sub: string; role: "admin" | "user"; ver: number },
  falhaBanco: null as null | string,
}));

vi.mock("@/lib/supabase", () => ({
  db: {
    async rpc() {
      return { data: 0, error: null };
    },
  },
}));

vi.mock("@/lib/auth/users", () => ({
  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  },
  async probeUsers() {
    if (h.falhaBanco) {
      return { ok: false as const, reason: "unavailable" as const, message: h.falhaBanco };
    }
    return { ok: true as const, empty: h.usuarios.length === 0 };
  },
  async insertUser(row: Omit<UsuarioMock, "id">) {
    const emailNorm = row.email.trim().toLowerCase();
    if (h.usuarios.some((u) => u.email === emailNorm)) {
      throw new Error("Já existe um usuário com esse email.");
    }
    const novo: UsuarioMock = { ...row, email: emailNorm, id: `user-${h.usuarios.length + 1}` };
    h.usuarios.push(novo);
    return { id: novo.id };
  },
  async findForLogin(email: string) {
    const emailNorm = email.trim().toLowerCase();
    const u = h.usuarios.find((x) => x.email === emailNorm);
    if (!u) return null;
    return { id: u.id, role: u.role, token_version: 1, password_hash: u.password_hash };
  },
  async touchLogin() {},
}));

vi.mock("@/lib/auth/cookie", () => ({
  async createSessionCookie(payload: { sub: string; role: "admin" | "user"; ver: number }) {
    h.sessaoCriada = payload;
  },
  async destroySessionCookie() {},
}));

vi.mock("next/cache", () => ({
  revalidatePath() {},
}));

vi.mock("next/headers", () => ({
  async headers() {
    return new Headers();
  },
}));

vi.mock("next/navigation", () => ({
  redirect(url: string): never {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { criarConta, login } from "@/app/auth/actions";

function form(dados: { name?: string; email?: string; password?: string }): FormData {
  const fd = new FormData();
  if (dados.name !== undefined) fd.set("name", dados.name);
  if (dados.email !== undefined) fd.set("email", dados.email);
  if (dados.password !== undefined) fd.set("password", dados.password);
  return fd;
}

beforeEach(() => {
  h.usuarios = [];
  h.sessaoCriada = null;
  h.falhaBanco = null;
});

describe("criarConta e login", () => {
  it("cria o primeiro usuário como admin quando o banco está vazio", async () => {
    await expect(
      criarConta(undefined, form({ name: "Ana", email: "ana@exemplo.com", password: "Senha1234" })),
    ).rejects.toThrow("REDIRECT:/painel/negocio");

    expect(h.usuarios).toHaveLength(1);
    expect(h.usuarios[0]).toMatchObject({
      name: "Ana",
      email: "ana@exemplo.com",
      role: "admin",
    });
    expect(h.sessaoCriada).toEqual({ sub: "user-1", role: "admin", ver: 1 });
  });

  it("permite criar novas contas como user mesmo depois que já existe admin", async () => {
    h.usuarios.push({
      id: "user-1",
      name: "Admin",
      email: "admin@exemplo.com",
      password_hash: "hash",
      role: "admin",
    });

    await expect(
      criarConta(undefined, form({ name: "Carlos", email: "carlos@exemplo.com", password: "Senha1234" })),
    ).rejects.toThrow("REDIRECT:/painel/negocio");

    expect(h.usuarios).toHaveLength(2);
    expect(h.usuarios[1]).toMatchObject({
      name: "Carlos",
      email: "carlos@exemplo.com",
      role: "user",
    });
    expect(h.sessaoCriada).toEqual({ sub: "user-2", role: "user", ver: 1 });
  });

  it("recusa email já cadastrado com mensagem clara e preserva nome e email", async () => {
    h.usuarios.push({
      id: "user-1",
      name: "Ana",
      email: "ana@exemplo.com",
      password_hash: "hash",
      role: "admin",
    });

    const res = await criarConta(
      undefined,
      form({ name: "Outra Ana", email: "ANA@exemplo.com", password: "Senha1234" }),
    );
    expect(res).toEqual({
      error: "Já existe um usuário com esse email.",
      name: "Outra Ana",
      email: "ANA@exemplo.com",
    });
    expect(h.sessaoCriada).toBeNull();
  });

  it("valida nome, email e senha antes de gravar e preserva nome e email no estado", async () => {
    expect(await criarConta(undefined, form({ name: "", email: "a@b.com", password: "Senha1234" }))).toEqual({
      error: "Informe seu nome.",
      name: "",
      email: "a@b.com",
    });
    expect(await criarConta(undefined, form({ name: "Ana", email: "invalido", password: "Senha1234" }))).toEqual({
      error: "Informe um email válido.",
      name: "Ana",
      email: "invalido",
    });
    expect(await criarConta(undefined, form({ name: "Ana", email: "a@b.com", password: "curta" }))).toEqual({
      error: "A senha precisa de pelo menos 8 caracteres.",
      name: "Ana",
      email: "a@b.com",
    });
    expect(h.usuarios).toHaveLength(0);
  });

  it("login preserva o email preenchido quando a senha está incorreta", async () => {
    await expect(
      criarConta(undefined, form({ name: "Ana", email: "ana@exemplo.com", password: "Senha1234" })),
    ).rejects.toThrow("REDIRECT:/painel/negocio");

    const res = await login(undefined, form({ email: "ana@exemplo.com", password: "SenhaErrada99" }));
    expect(res).toEqual({
      error: "Email ou senha incorretos.",
      email: "ana@exemplo.com",
    });
  });
});
