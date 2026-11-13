import { afterEach, describe, expect, it } from "vitest";
import { abrirBancoTeste, carregarSql, type BancoTeste } from "../helpers/banco";

let b: BancoTeste | undefined;

afterEach(async () => {
  await b?.fechar();
  b = undefined;
});

describe("banco de teste", () => {
  it("carrega o SQL de novo sobre a mesma instância sem lançar (idempotente)", async () => {
    b = await abrirBancoTeste();
    await expect(carregarSql(b.pg)).resolves.toBeUndefined();
    await expect(carregarSql(b.pg)).resolves.toBeUndefined();
  });
});

describe("01-auth.sql", () => {
  it("cria users com índice único em lower(email)", async () => {
    b = await abrirBancoTeste();
    const idx = await b.q(
      `select indexdef from pg_indexes where schemaname = 'public' and tablename = 'users' and indexname = 'users_email_lower_idx'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/UNIQUE INDEX/);
    expect(idx[0].indexdef).toMatch(/lower\(email\)/);

    await b.q(`insert into users (email, name, password_hash) values ('Ana@Exemplo.com', 'Ana', 'x')`);
    await expect(
      b.q(`insert into users (email, name, password_hash) values ('ana@exemplo.com', 'Outra', 'y')`),
    ).rejects.toThrow(/users_email_lower_idx/);
  });

  it("users não tem ig_account_id e tem RLS ligado", async () => {
    b = await abrirBancoTeste();
    const cols = await b.q(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain("ig_account_id");
    const rls = await b.q(
      `select relname, relrowsecurity from pg_class where relname in ('users', 'login_attempts') order by relname`,
    );
    expect(rls).toEqual([
      { relname: "login_attempts", relrowsecurity: true },
      { relname: "users", relrowsecurity: true },
    ]);
  });

  it("limite de login conta as falhas da chave na janela", async () => {
    b = await abrirBancoTeste();
    const args = { p_key: "email:ana@exemplo.com", p_window_seconds: 900 };
    expect(await b.rpc("login_failures", args)).toBe(0);
    expect(await b.rpc("login_register_failure", { ...args, p_keep: 10 })).toBe(1);
    expect(await b.rpc("login_register_failure", { ...args, p_keep: 10 })).toBe(2);
    expect(await b.rpc("login_failures", args)).toBe(2);
    // Guarda só as p_keep mais recentes.
    expect(await b.rpc("login_register_failure", { ...args, p_keep: 2 })).toBe(2);
    expect(await b.rpc("login_failures", { p_key: "email:outra@exemplo.com", p_window_seconds: 900 })).toBe(0);
  });
});

describe("rpc no formato do supabase-js", () => {
  async function comFuncoes() {
    b = await abrirBancoTeste();
    await b.pg.exec(`
      create table t_item (id int primary key, nome text, valor numeric, quando timestamptz, dados jsonb);
      insert into t_item values
        (1, 'um', 10.5, '2026-11-12 10:00:00+00', '{"a": 1}'),
        (2, 'dois', 800, '2026-11-12 11:00:00+00', null);

      create function f_item(p_id int) returns t_item language sql as $$
        select * from t_item where id = p_id $$;
      create function f_itens(p_min numeric default 0) returns setof t_item language sql as $$
        select * from t_item where valor >= p_min order by id $$;
      create function f_tabela() returns table (id int, nome text) language sql as $$
        select id, nome from t_item order by id $$;
      create function f_nomes() returns setof text language sql as $$
        select nome from t_item order by id $$;
      create function f_eco(p_dados jsonb, p_tags text[] default '{}') returns jsonb language sql as $$
        select jsonb_build_object('dados', p_dados, 'tags', to_jsonb(p_tags)) $$;
      create function f_nada() returns void language sql as $$ select $$;
      create function f_regra() returns int language plpgsql as $$
        begin raise exception 'regra: cliente não encontrado'; end $$;
    `);
    return b;
  }

  it("função de linha única devolve objeto; setof devolve lista", async () => {
    const b = await comFuncoes();
    expect(await b.rpc("f_item", { p_id: 1 })).toEqual({
      id: 1,
      nome: "um",
      valor: 10.5,
      quando: "2026-11-12T10:00:00+00:00",
      dados: { a: 1 },
    });
    expect(await b.rpc("f_itens", { p_min: 100 })).toEqual([
      { id: 2, nome: "dois", valor: 800, quando: "2026-11-12T11:00:00+00:00", dados: null },
    ]);
    expect(await b.rpc("f_itens", { p_min: 5000 })).toEqual([]);
    expect(await b.rpc("f_itens")).toHaveLength(2);
    expect(await b.rpc("f_tabela")).toEqual([
      { id: 1, nome: "um" },
      { id: 2, nome: "dois" },
    ]);
    expect(await b.rpc("f_nomes")).toEqual(["um", "dois"]);
  });

  it("argumentos jsonb e array chegam pelo tipo do parâmetro; void devolve null", async () => {
    const b = await comFuncoes();
    expect(await b.rpc("f_eco", { p_dados: { lista: [1, 2], nome: "x" }, p_tags: ["a", "b"] })).toEqual({
      dados: { lista: [1, 2], nome: "x" },
      tags: ["a", "b"],
    });
    expect(await b.rpc("f_eco", { p_dados: [1, "dois"] })).toEqual({ dados: [1, "dois"], tags: [] });
    expect(await b.rpc("f_nada")).toBeNull();
  });

  it("erro de regra chega com a mensagem crua do Postgres", async () => {
    const b = await comFuncoes();
    await expect(b.rpc("f_regra")).rejects.toThrow(/^regra: cliente não encontrado$/);
    await expect(b.rpc("f_item", { p_inexistente: 1 })).rejects.toThrow(/p_inexistente/);
    await expect(b.rpc("nao_existe")).rejects.toThrow(/nao_existe/);
    await expect(b.rpc("f_item; drop table users")).rejects.toThrow(/função inválida/);
  });
});
