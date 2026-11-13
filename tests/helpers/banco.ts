// Banco de teste: PGlite (Postgres em WASM, em memória) com os arquivos SQL de
// verdade de `supabase/`. Porta o `rpcPglite` do meu-chat
// (estudio/scripts/lib/banco.mjs): as regras moram no SQL, então os testes
// chamam as funções SQL como o app chama em produção, por `rpc`.
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import type { Rpc } from "@/lib/dominio/tipos";

const SUPABASE = fileURLToPath(new URL("../../supabase", import.meta.url));

/** Arquivos carregados: `supabase/[0-8]*.sql`, em ordem alfabética. */
const ARQUIVO_SQL = /^[0-8].*\.sql$/;

/** Nome de função e de argumento aceito em `rpc`. */
const NOME = /^[a-z_][a-z0-9_]*$/;

export type BancoTeste = {
  rpc: Rpc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q(sql: string, params?: unknown[]): Promise<any[]>;
  fechar(): Promise<void>;
  /** A instância crua, para `exec` de vários comandos (criar função de teste etc.). */
  pg: PGlite;
};

/** Banco novo, em memória, com todo o SQL de `supabase/` carregado. */
export async function abrirBancoTeste(): Promise<BancoTeste> {
  const pg = new PGlite({ extensions: { unaccent } });
  try {
    await carregarSql(pg);
  } catch (e) {
    await pg.close();
    throw e;
  }
  return {
    pg,
    rpc: (nome, args) => rpcPglite(pg, nome, args),
    async q(sql, params) {
      return (await pg.query(sql, params)).rows as Record<string, unknown>[];
    },
    fechar: () => pg.close(),
  };
}

/**
 * Cria os papéis do Supabase (não existem no PGlite) e roda os arquivos SQL.
 * O SQL é idempotente, então dá para rodar de novo sobre a mesma instância.
 */
export async function carregarSql(pg: PGlite): Promise<void> {
  await pg.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
  `);
  const arquivos = (await readdir(SUPABASE)).filter((f) => ARQUIVO_SQL.test(f)).sort();
  for (const arquivo of arquivos) {
    const sql = await readFile(path.join(SUPABASE, arquivo), "utf8");
    try {
      await pg.exec(sql);
    } catch (e) {
      throw new Error(`supabase/${arquivo}: ${mensagem(e)}`, { cause: e });
    }
  }
}

/**
 * MEI de teste: cria um usuário e chama `mei_salvar` (Task 3). Devolve o id do MEI.
 * Só funciona depois que `supabase/02-clientes.sql` existir.
 */
export async function criarMei(b: BancoTeste, nome = "MEI de teste"): Promise<string> {
  const [u] = await b.q(
    `insert into public.users (email, name, password_hash) values ($1, $2, 'teste') returning id`,
    [`${randomUUID()}@teste.local`, nome],
  );
  const mei = (await b.rpc("mei_salvar", { p_user: u.id, p_dados: { nome } })) as { id: string };
  return mei.id;
}

type Assinatura = { retset: boolean; vazio: boolean; args: Record<string, string> };

/**
 * Chama uma função como o PostgREST chama e devolve no formato do supabase-js:
 * valor solto para função escalar, objeto para função de linha única, lista
 * para `setof`/`returns table`, `null` para `void`.
 *
 * Como no PostgREST, os argumentos vão por nome, num JSON convertido pelo tipo
 * declarado de cada parâmetro (`jsonb_to_record`), e o resultado volta pelo
 * JSON do Postgres: numeric vira número, timestamptz vira texto ISO, jsonb vira
 * objeto. Argumento `undefined` some, e vale o default da função.
 */
export async function rpcPglite(pg: PGlite, nome: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (!NOME.test(nome)) throw new Error(`função inválida: ${nome}`);
  const chaves = Object.keys(args).filter((k) => args[k] !== undefined);
  for (const k of chaves) if (!NOME.test(k)) throw new Error(`argumento inválido: ${k}`);

  const fn = await assinatura(pg, nome, chaves);
  const chamada = `public.${nome}(${chaves.map((k) => `${k} => _a.${k}`).join(", ")})`;
  const de = chaves.length
    ? `from jsonb_to_record($1::jsonb) as _a(${chaves.map((k) => `${k} ${fn.args[k]}`).join(", ")})`
    : "";
  const sql = fn.vazio
    ? `select ${chamada} ${de}`
    : fn.retset
      ? `select coalesce(jsonb_agg(_r), '[]'::jsonb) as r ${de ? `${de} cross join lateral` : "from"} ${chamada} as _r`
      : `select to_jsonb(${chamada}) as r ${de}`;

  let res;
  try {
    res = await pg.query<{ r: unknown }>(sql, chaves.length ? [JSON.stringify(args)] : []);
  } catch (e) {
    // Mesma mensagem que `error.message` traz no supabase-js.
    throw Object.assign(new Error(mensagem(e), { cause: e }), { code: (e as { code?: string }).code });
  }
  return fn.vazio ? null : (res.rows[0]?.r ?? null);
}

async function assinatura(pg: PGlite, nome: string, chaves: string[]): Promise<Assinatura> {
  const { rows } = await pg.query<Assinatura>(
    `select p.proretset as retset,
            p.prorettype = 'void'::regtype as vazio,
            coalesce((
              select jsonb_object_agg(a.nome, format_type(a.tipo, null))
              from unnest(
                coalesce(p.proargnames, array_fill(''::text, array[cardinality(coalesce(p.proallargtypes, p.proargtypes::oid[]))])),
                coalesce(p.proallargtypes, p.proargtypes::oid[]),
                coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargtypes::oid[])]))
              ) as a(nome, tipo, modo)
              where a.modo in ('i', 'b') and a.nome <> ''
            ), '{}'::jsonb) as args
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
    [nome],
  );
  if (!rows.length) throw new Error(`função não encontrada: public.${nome}`);
  // Sobrecarga: a primeira que aceita todos os argumentos passados.
  const fn = rows.find((r) => chaves.every((k) => k in r.args));
  if (!fn) {
    const falta = chaves.find((k) => !(k in rows[0].args));
    throw new Error(`public.${nome} não tem o argumento ${falta}`);
  }
  return fn;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
