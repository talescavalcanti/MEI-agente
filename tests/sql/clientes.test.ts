import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cliente, Mei } from "@/lib/dominio/tipos";
import { abrirBancoTeste, carregarSql, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
});

afterEach(async () => {
  await b.fechar();
});

const salvar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("cliente_salvar", { p_mei: mei, p_dados: dados }) as Promise<Cliente>;
const buscar = (mei: string, termo: string | null) =>
  b.rpc("cliente_buscar", { p_mei: mei, p_termo: termo }) as Promise<Cliente[]>;

async function criarUsuario(email = "dono@teste.local"): Promise<string> {
  const [u] = await b.q(
    `insert into public.users (email, name, password_hash) values ($1, 'Dono', 'x') returning id`,
    [email],
  );
  return u.id;
}

describe("so_digitos", () => {
  it("tira o que não é dígito e o 55 inicial quando sobram 12 ou 13 dígitos", async () => {
    const casos: [string | null, string][] = [
      ["62 9 9999-0000", "62999990000"],
      ["+55 (62) 99999-0000", "62999990000"],
      ["55 62 3333-0000", "6233330000"],
      // 11 dígitos começando em 55 (DDD 55, RS): o 55 é o DDD, fica.
      ["(55) 99999-0000", "55999990000"],
      ["sem número", ""],
      [null, ""],
    ];
    for (const [entrada, esperado] of casos) {
      expect(await b.rpc("so_digitos", { p_texto: entrada }), String(entrada)).toBe(esperado);
    }
  });
});

describe("meis", () => {
  it("criarMei (helper) cria o usuário e o MEI e devolve o id do MEI", async () => {
    const id = await criarMei(b, "Elétrica do Zé");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const linhas = await b.q(`select m.nome, u.name from meis m join users u on u.id = m.user_id where m.id = $1`, [id]);
    expect(linhas).toEqual([{ nome: "Elétrica do Zé", name: "Elétrica do Zé" }]);
    expect(await criarMei(b)).not.toBe(id);
  });

  it("mei_salvar cria na 1ª vez e atualiza na 2ª, sem apagar campo ausente", async () => {
    const user = await criarUsuario();
    const novo = (await b.rpc("mei_salvar", {
      p_user: user,
      p_dados: { nome: "  Zé Refrigeração ", atividade: "Técnico de ar-condicionado", cidade: "Goiânia" },
    })) as Mei;
    expect(novo).toMatchObject({
      user_id: user,
      nome: "Zé Refrigeração",
      atividade: "Técnico de ar-condicionado",
      cidade: "Goiânia",
      telefone: null,
      chave_pix: null,
    });

    const depois = (await b.rpc("mei_salvar", {
      p_user: user,
      p_dados: { chave_pix: "ze@pix.com", cidade: "Anápolis" },
    })) as Mei;
    expect(depois).toMatchObject({
      id: novo.id,
      nome: "Zé Refrigeração",
      atividade: "Técnico de ar-condicionado",
      cidade: "Anápolis",
      chave_pix: "ze@pix.com",
    });
    expect(await b.q(`select count(*)::int as n from meis`)).toEqual([{ n: 1 }]);
  });

  it("mei_salvar sem nome em cadastro novo é recusado", async () => {
    const user = await criarUsuario();
    await expect(b.rpc("mei_salvar", { p_user: user, p_dados: { cidade: "Goiânia" } })).rejects.toThrow(
      /^regra: informe o nome do negócio$/,
    );
    await expect(b.rpc("mei_salvar", { p_user: user, p_dados: { nome: "   " } })).rejects.toThrow(
      /^regra: informe o nome do negócio$/,
    );
    expect(await b.q(`select count(*)::int as n from meis`)).toEqual([{ n: 0 }]);
  });

  it("mei_do_usuario devolve o MEI do usuário, e null para quem ainda não tem", async () => {
    const user = await criarUsuario();
    expect(await b.rpc("mei_do_usuario", { p_user: user })).toBeNull();
    const mei = (await b.rpc("mei_salvar", { p_user: user, p_dados: { nome: "Foto da Ana" } })) as Mei;
    expect(await b.rpc("mei_do_usuario", { p_user: user })).toEqual(mei);
    const outro = await criarUsuario("outro@teste.local");
    expect(await b.rpc("mei_do_usuario", { p_user: outro })).toBeNull();
  });
});

describe("cliente_salvar", () => {
  it("mesmo cliente digitado de formas diferentes vira um cadastro só", async () => {
    const mei = await criarMei(b);
    const a = await salvar(mei, { nome: "Maria", whatsapp: "62 9 9999-0000", endereco: "Setor Bueno" });
    const c = await salvar(mei, { nome: "Maria Souza", whatsapp: "+55 (62) 99999-0000" });

    expect(await b.q(`select count(*)::int as n from clientes`)).toEqual([{ n: 1 }]);
    expect(c.id).toBe(a.id);
    expect(c.nome).toBe("Maria Souza");
    expect(c.whatsapp).toBe("62999990000");
    // Campo ausente na 2ª chamada não apaga o que já estava.
    expect(c.endereco).toBe("Setor Bueno");
  });

  it("sem nome em cadastro novo é recusado", async () => {
    const mei = await criarMei(b);
    await expect(salvar(mei, { whatsapp: "62 99999-0000" })).rejects.toThrow(/^regra: informe o nome do cliente$/);
    await expect(salvar(mei, { nome: "  " })).rejects.toThrow(/^regra: informe o nome do cliente$/);
    await expect(salvar(mei, {})).rejects.toThrow(/^regra: informe o nome do cliente$/);
    expect(await b.q(`select count(*)::int as n from clientes`)).toEqual([{ n: 0 }]);
  });

  it("id de outro MEI se comporta como id inexistente e não altera a linha", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    const original = await salvar(meiA, { nome: "Maria Souza", whatsapp: "62 99999-0000" });
    const [antes] = await b.q(`select * from clientes where id = $1`, [original.id]);

    await expect(salvar(meiB, { id: original.id, nome: "x" })).rejects.toThrow(/^regra: cliente não encontrado$/);

    const [depois] = await b.q(`select * from clientes where id = $1`, [original.id]);
    expect(depois).toEqual(antes);
    expect(await b.q(`select count(*)::int as n from clientes`)).toEqual([{ n: 1 }]);
  });

  it("id inventado pelo modelo (uuid inexistente ou texto qualquer) dá erro legível", async () => {
    const mei = await criarMei(b);
    for (const id of ["00000000-0000-4000-8000-000000000000", "cliente-12", "", 12]) {
      await expect(salvar(mei, { id, nome: "x" }), String(id)).rejects.toThrow(/^regra: cliente não encontrado$/);
    }
    expect(await b.q(`select count(*)::int as n from clientes`)).toEqual([{ n: 0 }]);
  });

  it("com id atualiza só os campos informados", async () => {
    const mei = await criarMei(b);
    const a = await salvar(mei, { nome: "Carlos", whatsapp: "62 98888-0000", observacoes: "prefere manhã" });
    const c = await salvar(mei, { id: a.id, endereco: "Rua 10, Centro", nome: "", observacoes: null });
    expect(c).toMatchObject({
      id: a.id,
      nome: "Carlos",
      whatsapp: "62988880000",
      endereco: "Rua 10, Centro",
      observacoes: "prefere manhã",
    });
    expect(Date.parse(c.atualizado_em)).toBeGreaterThanOrEqual(Date.parse(a.atualizado_em));
  });

  it("o mesmo WhatsApp pode existir em MEIs diferentes, mas não em dois clientes do mesmo MEI", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    const a = await salvar(meiA, { nome: "Maria", whatsapp: "62 99999-0000" });
    const outroMei = await salvar(meiB, { nome: "Maria de lá", whatsapp: "62 99999-0000" });
    expect(outroMei.id).not.toBe(a.id);

    const carlos = await salvar(meiA, { nome: "Carlos", whatsapp: "62 98888-0000" });
    await expect(salvar(meiA, { id: carlos.id, whatsapp: "(62) 99999-0000" })).rejects.toThrow(
      /^regra: já existe outro cliente com esse WhatsApp$/,
    );
    const [linha] = await b.q(`select whatsapp from clientes where id = $1`, [carlos.id]);
    expect(linha.whatsapp).toBe("62988880000");
  });

  it("clientes sem WhatsApp não se misturam entre si", async () => {
    const mei = await criarMei(b);
    const a = await salvar(mei, { nome: "João" });
    const c = await salvar(mei, { nome: "Pedro", whatsapp: "a combinar" });
    expect(c.id).not.toBe(a.id);
    expect(c.whatsapp).toBeNull();
    expect(await b.q(`select count(*)::int as n from clientes`)).toEqual([{ n: 2 }]);
  });
});

describe("cliente_buscar", () => {
  it("acha por nome sem acento e sem caixa, só dentro do próprio MEI", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    await salvar(meiA, { nome: "María Souza", whatsapp: "62 99999-0000" });
    await salvar(meiA, { nome: "Carlos Lima" });

    expect((await buscar(meiA, "maria")).map((c) => c.nome)).toEqual(["María Souza"]);
    expect((await buscar(meiA, "  SOUZÁ ")).map((c) => c.nome)).toEqual(["María Souza"]);
    expect((await buscar(meiA, "ia so")).map((c) => c.nome)).toEqual(["María Souza"]);
    expect(await buscar(meiB, "maria")).toEqual([]);
  });

  it("acha pelos dígitos do telefone, em qualquer formato", async () => {
    const meiA = await criarMei(b, "A");
    const meiB = await criarMei(b, "B");
    await salvar(meiA, { nome: "Maria Souza", whatsapp: "62 99999-0000" });
    await salvar(meiA, { nome: "Carlos Lima", whatsapp: "62 98888-1234" });

    expect((await buscar(meiA, "+55 (62) 99999-0000")).map((c) => c.nome)).toEqual(["Maria Souza"]);
    expect((await buscar(meiA, "8888-1234")).map((c) => c.nome)).toEqual(["Carlos Lima"]);
    expect(await buscar(meiB, "62 99999-0000")).toEqual([]);
  });

  it("curinga do like no termo é texto comum", async () => {
    const mei = await criarMei(b);
    await salvar(mei, { nome: "Maria Souza" });
    expect(await buscar(mei, "%")).toEqual([]);
    expect(await buscar(mei, "m_ria")).toEqual([]);
  });

  it("devolve no máximo 10, em ordem de nome; termo vazio lista os clientes do MEI", async () => {
    const mei = await criarMei(b);
    const outro = await criarMei(b, "outro");
    for (let i = 1; i <= 12; i++) await salvar(mei, { nome: `Cliente ${String(i).padStart(2, "0")}` });
    await salvar(outro, { nome: "Cliente de fora" });

    const achados = await buscar(mei, "cliente");
    expect(achados).toHaveLength(10);
    expect(achados[0].nome).toBe("Cliente 01");
    expect(achados[9].nome).toBe("Cliente 10");

    for (const vazio of ["", "   ", null]) {
      const todos = await buscar(mei, vazio);
      expect(todos).toHaveLength(10);
      expect(todos.every((c) => c.mei_id === mei)).toBe(true);
    }
  });
});

describe("02-clientes.sql", () => {
  it("meis e clientes têm RLS ligado e nenhuma política", async () => {
    const rls = await b.q(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('meis', 'clientes') order by relname`,
    );
    expect(rls).toEqual([
      { relname: "clientes", relrowsecurity: true },
      { relname: "meis", relrowsecurity: true },
    ]);
    expect(await b.q(`select 1 from pg_policies where tablename in ('meis', 'clientes')`)).toEqual([]);
  });

  it("recarregar o SQL não perde dados nem lança (idempotente)", async () => {
    const mei = await criarMei(b);
    await salvar(mei, { nome: "Maria Souza", whatsapp: "62 99999-0000" });
    await carregarSql(b.pg);
    await carregarSql(b.pg);
    expect((await buscar(mei, "maria")).map((c) => c.nome)).toEqual(["Maria Souza"]);
  });
});
