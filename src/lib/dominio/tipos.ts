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

/** Linha de `meis`: o negócio. Um por usuário. */
export type Mei = {
  id: string;
  user_id: string;
  nome: string;
  atividade: string | null;
  cidade: string | null;
  telefone: string | null;
  chave_pix: string | null;
  /** Data e hora em texto ISO. */
  criado_em: string;
};

/** Campos aceitos por `mei_salvar`. Campo ausente não apaga o que já estava. */
export type MeiDados = {
  nome?: string;
  atividade?: string;
  cidade?: string;
  telefone?: string;
  chave_pix?: string;
};

/** Linha de `clientes`. */
export type Cliente = {
  id: string;
  mei_id: string;
  nome: string;
  /** Só dígitos, com DDD e sem o 55 do país (ex.: `62999990000`). */
  whatsapp: string | null;
  endereco: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Campos aceitos por `cliente_salvar`. Com `id`, atualiza esse cliente; sem
 * `id`, casa pelo WhatsApp e atualiza, ou cria. Campo ausente não apaga o que
 * já estava.
 */
export type ClienteDados = {
  id?: string;
  nome?: string;
  whatsapp?: string;
  endereco?: string;
  observacoes?: string;
};
