-- ============================================================================
-- MEIagente — agente: conversas, auditoria, uso e memórias
-- Rode no SQL Editor do Supabase, depois do 05-pendencias.sql. Idempotente.
--
-- Mesma postura dos anteriores: RLS ligado e SEM políticas; toda função recebe
-- `p_mei` e filtra por ele (id de outro MEI = id inexistente); violação de
-- regra é `raise exception 'regra: <frase para o usuário>'`.
--
-- Histórico append-only: `conversa_mensagens.content` guarda a mensagem do
-- modelo inteira, como veio (formato ModelMessage do AI SDK), e é reenviada
-- sem alteração. Nada aqui edita ou apaga mensagem.
--
-- `agente_acoes` é a trilha de auditoria (README §9): cada chamada de
-- ferramenta do agente (tipo `ferramenta`) e cada decisão do usuário num
-- cartão (tipo `decisao`, gravada por item_decidir, 04-documentos.sql).
--
-- `agente_uso` soma tokens por MEI e dia (America/Sao_Paulo) para o limite
-- diário de uso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.conversas (
  id        uuid primary key default gen_random_uuid(),
  mei_id    uuid not null references public.meis (id) on delete cascade,
  titulo    text not null,
  origem    text not null default 'chat' check (origem in ('chat', 'agendador')),
  criado_em timestamptz not null default now()
);

create index if not exists conversas_mei_idx on public.conversas (mei_id, criado_em desc);

alter table public.conversas enable row level security;

-- Uma linha por mensagem do modelo. `id` crescente dá a ordem da conversa.
-- `cartoes`: [{tipo, id}] dos itens criados (orçamento, contrato, mensagem).
create table if not exists public.conversa_mensagens (
  id          bigserial primary key,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  role        text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content     jsonb not null,
  cartoes     jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists conversa_mensagens_conversa_idx on public.conversa_mensagens (conversa_id, id);

alter table public.conversa_mensagens enable row level security;

create table if not exists public.agente_acoes (
  id          uuid primary key default gen_random_uuid(),
  mei_id      uuid not null references public.meis (id) on delete cascade,
  conversa_id uuid references public.conversas (id) on delete set null,
  tipo        text not null check (tipo in ('ferramenta', 'decisao')),
  nome        text not null,
  entrada     jsonb,
  saida       jsonb,
  erro        boolean not null default false,
  user_id     uuid references public.users (id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index if not exists agente_acoes_mei_idx on public.agente_acoes (mei_id, criado_em desc);

alter table public.agente_acoes enable row level security;

create table if not exists public.agente_uso (
  mei_id         uuid not null references public.meis (id) on delete cascade,
  dia            date not null,
  tokens_entrada bigint not null default 0,
  tokens_saida   bigint not null default 0,
  primary key (mei_id, dia)
);

alter table public.agente_uso enable row level security;

-- Fatos duradouros do negócio que o agente guarda (salvar_memoria).
create table if not exists public.memorias (
  id        uuid primary key default gen_random_uuid(),
  mei_id    uuid not null references public.meis (id) on delete cascade,
  fato      text not null check (char_length(fato) between 1 and 500),
  criado_em timestamptz not null default now()
);

create index if not exists memorias_mei_idx on public.memorias (mei_id, criado_em desc);

alter table public.memorias enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Id da conversa do MEI. Não achou = regra.
create or replace function public.conversa_do_mei(p_mei uuid, p_conversa uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.conversas c
  where c.id = p_conversa and c.mei_id = p_mei;
  if v_id is null then
    raise exception 'regra: conversa não encontrada';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversas
-- ---------------------------------------------------------------------------

-- Nova conversa. Título em branco = "Nova conversa"; corta em 80 caracteres.
create or replace function public.conversa_criar(p_mei uuid, p_origem text default 'chat', p_titulo text default null)
returns public.conversas
language plpgsql
set search_path = ''
as $$
declare
  v_origem text := lower(btrim(coalesce(p_origem, 'chat')));
  v_titulo text := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_titulo, ''), '\s+', ' ', 'g')), ''), 'Nova conversa'), 80);
  v_conv   public.conversas;
begin
  if v_origem not in ('chat', 'agendador') then
    raise exception 'regra: origem de conversa inválida (use chat ou agendador)';
  end if;
  if not exists (select 1 from public.meis m where m.id = p_mei) then
    raise exception 'regra: negócio não encontrado';
  end if;

  insert into public.conversas (mei_id, titulo, origem)
  values (p_mei, v_titulo, v_origem)
  returning * into v_conv;
  return v_conv;
end;
$$;

-- Acrescenta mensagens à conversa, todas na mesma transação (ou nenhuma).
-- p_mensagens: [{role, content, cartoes?}], na ordem. Usada pelo laço do
-- agente para gravar juntas a mensagem do assistente e a dos resultados das
-- ferramentas: nunca fica chamada sem resultado no histórico.
create or replace function public.conversa_anexar_varias(p_mei uuid, p_conversa uuid, p_mensagens jsonb)
returns setof public.conversa_mensagens
language plpgsql
set search_path = ''
as $$
declare
  v_conversa uuid := public.conversa_do_mei(p_mei, p_conversa);
  v_msg      jsonb;
  v_role     text;
  v_linha    public.conversa_mensagens;
begin
  if p_mensagens is null or jsonb_typeof(p_mensagens) <> 'array' or jsonb_array_length(p_mensagens) = 0 then
    raise exception 'regra: nenhuma mensagem para gravar';
  end if;

  for v_msg in select e from jsonb_array_elements(p_mensagens) with ordinality as t(e, i) order by i loop
    v_role := v_msg->>'role';
    if v_role is null or v_role not in ('system', 'user', 'assistant', 'tool') then
      raise exception 'regra: papel de mensagem inválido';
    end if;
    if jsonb_typeof(v_msg->'content') is distinct from 'object' then
      raise exception 'regra: conteúdo de mensagem inválido';
    end if;
    if jsonb_typeof(v_msg->'cartoes') not in ('array', 'null') then
      raise exception 'regra: cartões inválidos';
    end if;

    insert into public.conversa_mensagens (conversa_id, role, content, cartoes)
    values (v_conversa, v_role, v_msg->'content', nullif(v_msg->'cartoes', 'null'::jsonb))
    returning * into v_linha;
    return next v_linha;
  end loop;
end;
$$;

-- Acrescenta uma mensagem à conversa.
create or replace function public.conversa_anexar(p_mei uuid, p_conversa uuid, p_role text, p_content jsonb, p_cartoes jsonb default null)
returns public.conversa_mensagens
language plpgsql
set search_path = ''
as $$
declare
  v_linha public.conversa_mensagens;
begin
  select * into v_linha
  from public.conversa_anexar_varias(
    p_mei, p_conversa,
    jsonb_build_array(jsonb_build_object('role', p_role, 'content', p_content, 'cartoes', p_cartoes))
  );
  return v_linha;
end;
$$;

-- Mensagens da conversa, na ordem em que foram gravadas.
create or replace function public.conversa_ler(p_mei uuid, p_conversa uuid)
returns setof public.conversa_mensagens
language plpgsql
stable
set search_path = ''
as $$
declare
  v_conversa uuid := public.conversa_do_mei(p_mei, p_conversa);
begin
  return query
    select m.*
    from public.conversa_mensagens m
    where m.conversa_id = v_conversa
    order by m.id;
end;
$$;

-- Conversas do MEI, a com mensagem mais recente primeiro (máx. 50).
create or replace function public.conversa_listar(p_mei uuid)
returns setof public.conversas
language sql
stable
set search_path = ''
as $$
  select c.*
  from public.conversas c
  left join lateral (
    select max(m.id) as ultima_id, max(m.criado_em) as ultima_em
    from public.conversa_mensagens m
    where m.conversa_id = c.id
  ) u on true
  where c.mei_id = p_mei
  order by coalesce(u.ultima_em, c.criado_em) desc, u.ultima_id desc nulls last, c.criado_em desc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

-- Registra uma ação do agente (ferramenta) ou do usuário (decisao).
-- Conversa é opcional; se vier, precisa ser do MEI.
create or replace function public.acao_registrar(
  p_mei      uuid,
  p_conversa uuid,
  p_tipo     text,
  p_nome     text,
  p_entrada  jsonb,
  p_saida    jsonb,
  p_erro     boolean default false,
  p_user     uuid default null
)
returns public.agente_acoes
language plpgsql
set search_path = ''
as $$
declare
  v_tipo  text := lower(btrim(coalesce(p_tipo, '')));
  v_nome  text := left(nullif(btrim(p_nome), ''), 100);
  v_acao  public.agente_acoes;
begin
  if v_tipo not in ('ferramenta', 'decisao') then
    raise exception 'regra: tipo de ação inválido (use ferramenta ou decisao)';
  end if;
  if v_nome is null then
    raise exception 'regra: ação sem nome';
  end if;
  if p_conversa is not null then
    perform public.conversa_do_mei(p_mei, p_conversa);
  elsif not exists (select 1 from public.meis m where m.id = p_mei) then
    raise exception 'regra: negócio não encontrado';
  end if;

  insert into public.agente_acoes (mei_id, conversa_id, tipo, nome, entrada, saida, erro, user_id)
  values (p_mei, p_conversa, v_tipo, v_nome, p_entrada, p_saida, coalesce(p_erro, false), p_user)
  returning * into v_acao;
  return v_acao;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uso (tokens por dia)
-- ---------------------------------------------------------------------------

-- Soma tokens ao dia de hoje (America/Sao_Paulo). Negativo ou nulo = 0.
create or replace function public.uso_somar(p_mei uuid, p_entrada bigint, p_saida bigint)
returns public.agente_uso
language plpgsql
set search_path = ''
as $$
declare
  v_uso public.agente_uso;
begin
  insert into public.agente_uso as u (mei_id, dia, tokens_entrada, tokens_saida)
  values (p_mei, public.hoje_sp(), greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_saida, 0), 0))
  on conflict (mei_id, dia) do update
    set tokens_entrada = u.tokens_entrada + excluded.tokens_entrada,
        tokens_saida   = u.tokens_saida + excluded.tokens_saida
  returning u.* into v_uso;
  return v_uso;
end;
$$;

-- Tokens usados hoje (entrada + saída).
create or replace function public.uso_hoje(p_mei uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(u.tokens_entrada + u.tokens_saida), 0)::bigint
  from public.agente_uso u
  where u.mei_id = p_mei and u.dia = public.hoje_sp();
$$;

-- ---------------------------------------------------------------------------
-- Memórias
-- ---------------------------------------------------------------------------

-- Guarda um fato do negócio. O mesmo fato (sem diferença de caixa, acento ou
-- espaços) não duplica: devolve o que já existe.
create or replace function public.memoria_salvar(p_mei uuid, p_fato text)
returns public.memorias
language plpgsql
set search_path = ''
as $$
declare
  v_fato text := btrim(regexp_replace(coalesce(p_fato, ''), '\s+', ' ', 'g'));
  v_mem  public.memorias;
begin
  if v_fato = '' then
    raise exception 'regra: o fato a guardar está vazio';
  end if;
  if char_length(v_fato) > 500 then
    raise exception 'regra: o fato a guardar passou de 500 caracteres';
  end if;
  if not exists (select 1 from public.meis m where m.id = p_mei) then
    raise exception 'regra: negócio não encontrado';
  end if;

  select m.* into v_mem
  from public.memorias m
  where m.mei_id = p_mei and public.sem_acento(m.fato) = public.sem_acento(v_fato)
  limit 1;
  if v_mem.id is not null then
    return v_mem;
  end if;

  insert into public.memorias (mei_id, fato)
  values (p_mei, v_fato)
  returning * into v_mem;
  return v_mem;
end;
$$;

-- Memórias do MEI, as mais novas primeiro (máx. 30).
create or replace function public.memoria_listar(p_mei uuid)
returns setof public.memorias
language sql
stable
set search_path = ''
as $$
  select m.*
  from public.memorias m
  where m.mei_id = p_mei
  order by m.criado_em desc, m.id desc
  limit 30;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.conversa_do_mei(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.conversa_criar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.conversa_anexar_varias(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.conversa_anexar(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.conversa_ler(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.conversa_listar(uuid) from public, anon, authenticated;
revoke execute on function public.acao_registrar(uuid, uuid, text, text, jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.uso_somar(uuid, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.uso_hoje(uuid) from public, anon, authenticated;
revoke execute on function public.memoria_salvar(uuid, text) from public, anon, authenticated;
revoke execute on function public.memoria_listar(uuid) from public, anon, authenticated;
grant execute on function public.conversa_do_mei(uuid, uuid) to service_role;
grant execute on function public.conversa_criar(uuid, text, text) to service_role;
grant execute on function public.conversa_anexar_varias(uuid, uuid, jsonb) to service_role;
grant execute on function public.conversa_anexar(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.conversa_ler(uuid, uuid) to service_role;
grant execute on function public.conversa_listar(uuid) to service_role;
grant execute on function public.acao_registrar(uuid, uuid, text, text, jsonb, jsonb, boolean, uuid) to service_role;
grant execute on function public.uso_somar(uuid, bigint, bigint) to service_role;
grant execute on function public.uso_hoje(uuid) to service_role;
grant execute on function public.memoria_salvar(uuid, text) to service_role;
grant execute on function public.memoria_listar(uuid) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
