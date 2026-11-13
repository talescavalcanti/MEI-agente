-- ============================================================================
-- MEIagente: usuários do painel e limite de tentativas de login
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- RLS ligado e SEM políticas. Ninguém acessa com a anon key; só o servidor,
-- com a service role key, que passa por cima do RLS. A senha NUNCA entra aqui
-- em texto: `password_hash` guarda scrypt (ver src/lib/auth/password.ts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Usuários
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  password_hash text not null,
  role          text not null default 'user' check (role in ('admin','user')),

  -- Invalidação de sessão. Toda troca de senha (e a exclusão do usuário)
  -- incrementa isto; o JWT carrega o valor de quando foi emitido, e o servidor
  -- recusa token com versão velha. É o que faz "trocar a senha" derrubar de
  -- verdade as sessões abertas em outros aparelhos.
  token_version int not null default 1,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Unicidade por email normalizado: "Ana@x.com" e "ana@x.com" são a mesma
-- pessoa. O índice é funcional em lower(), e o login também busca em lower():
-- os dois precisam casar, senão o índice não é usado e o duplicado passa.
create unique index if not exists users_email_lower_idx
  on public.users (lower(email));

alter table public.users enable row level security;

-- ----------------------------------------------------------------------------
-- Limite de tentativas de login
--
-- O código é fail-open: sem esta tabela, loga o erro e deixa tentar. As
-- funções não ficam expostas ao anon pelo PostgREST: senão qualquer um
-- bloquearia o email de outra pessoa chamando o RPC direto.
-- ----------------------------------------------------------------------------

-- Uma linha por chave ('email:<normalizado>' ou 'ip:<endereço>'), com os
-- horários das falhas recentes. Guardar os horários, e não um contador com
-- início de janela, é o que faz a janela ser deslizante: vale "no máximo N
-- falhas em QUALQUER intervalo de 15 min", sem a rajada dupla na virada.
create table if not exists public.login_attempts (
  key        text primary key,
  failures   timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists login_attempts_updated_idx
  on public.login_attempts (updated_at);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
grant select, insert, update, delete on public.login_attempts to service_role;

-- Falhas da chave dentro da janela. 0 se a chave não existe.
create or replace function public.login_failures(p_key text, p_window_seconds int)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select count(*)::int
    from public.login_attempts la, unnest(la.failures) t
    where la.key = p_key
      and t > now() - make_interval(secs => p_window_seconds)
  ), 0);
$$;

-- Registra uma falha e devolve quantas a chave tem na janela.
--
-- Atômico: o INSERT ... ON CONFLICT DO UPDATE trava a linha, então duas
-- falhas simultâneas da mesma chave nunca se perdem uma na outra.
-- Guarda só as `p_keep` mais recentes dentro da janela: basta para decidir o
-- bloqueio, e a linha não cresce sem limite sob ataque.
create or replace function public.login_register_failure(
  p_key text,
  p_window_seconds int,
  p_keep int
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.login_attempts as la (key, failures, updated_at)
  values (p_key, array[now()], now())
  on conflict (key) do update
    set failures = (
          select coalesce(array_agg(s.t order by s.t desc), '{}')
          from (
            select t
            from unnest(la.failures || now()) t
            where t > now() - make_interval(secs => p_window_seconds)
            order by t desc
            limit p_keep
          ) s
        ),
        updated_at = now()
  returning cardinality(la.failures) into n;

  -- Faxina: chave parada há um dia não bloqueia mais nada. Tabela pequena e
  -- com índice em updated_at: custa quase nada por falha.
  delete from public.login_attempts where updated_at < now() - interval '1 day';

  return n;
end;
$$;

revoke execute on function public.login_failures(text, int) from public, anon, authenticated;
revoke execute on function public.login_register_failure(text, int, int) from public, anon, authenticated;
grant execute on function public.login_failures(text, int) to service_role;
grant execute on function public.login_register_failure(text, int, int) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
