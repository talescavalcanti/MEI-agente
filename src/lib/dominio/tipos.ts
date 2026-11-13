// Tipos do domínio: linhas das tabelas e retornos das funções SQL.

/**
 * Chamada de função SQL por argumentos nomeados, no formato do supabase-js
 * (`db.rpc`): valor solto para função escalar, objeto para função que devolve
 * uma linha, lista para `setof`/`returns table`, `null` para `void`.
 *
 * Erro do banco vira `Error` com a mensagem crua do Postgres (a mesma de
 * `error.message` no supabase-js). Violação de regra começa com `regra:`.
 *
 * Em produção é implementada sobre `db.rpc`; nos testes, sobre o PGlite
 * (`tests/helpers/banco.ts`).
 */
export type Rpc = (nome: string, args?: Record<string, unknown>) => Promise<unknown>;
