-- ============================================================================
-- MEIagente — MEI (o negócio) e clientes
-- Rode no SQL Editor do Supabase, depois do 01-auth.sql. Idempotente.
--
-- Mesma postura do 01-auth.sql: RLS ligado e SEM políticas. Só o servidor
-- acessa, com a service role key.
--
-- As regras moram aqui. Toda função de domínio recebe `p_mei` e filtra por ele:
-- id de outro MEI se comporta como id inexistente. Violação de regra é
-- `raise exception 'regra: <frase para o usuário>'`; o prefixo `regra:` é o
-- contrato com a camada de ferramentas do agente.
-- ============================================================================

-- Busca de cliente ignora acento ("maria" acha "María"). No Supabase a extensão
-- mora no schema `extensions`; o bloco abaixo aceita qualquer schema em que ela
-- já esteja instalada.
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

do $do$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';

  -- Texto em minúsculas e sem acento, para comparar nomes.
  execute format(
    $f$
      create or replace function public.sem_acento(p_texto text)
      returns text
      language sql
      stable
      set search_path = ''
      as $fn$
        select lower(%I.unaccent(coalesce(p_texto, '')));
      $fn$
    $f$,
    v_schema
  );
end
$do$;

-- Telefone só com dígitos, sem o 55 do país. "62 9 9999-0000" e
-- "+55 (62) 99999-0000" viram "62999990000". O 55 só sai quando sobram 12 ou 13
-- dígitos (55 + DDD + número): com 10 ou 11, um 55 na frente é o DDD.
create or replace function public.so_digitos(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p_texto, ''), '\D', '', 'g') as d) t;
$$;

-- ---------------------------------------------------------------------------
-- MEI: o negócio. Um por usuário.
-- ---------------------------------------------------------------------------
create table if not exists public.meis (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references public.users (id) on delete cascade,
  nome       text not null,
  atividade  text,
  cidade     text,
  telefone   text,
  chave_pix  text,
  criado_em  timestamptz not null default now()
);

alter table public.meis enable row level security;

-- Cria o MEI do usuário na 1ª vez e atualiza nas seguintes. Campo ausente (ou
-- em branco) em `p_dados` não apaga o que já estava gravado.
-- p_dados: {nome?, atividade?, cidade?, telefone?, chave_pix?}
create or replace function public.mei_salvar(p_user uuid, p_dados jsonb)
returns public.meis
language plpgsql
set search_path = ''
as $$
declare
  v_nome      text := nullif(btrim(p_dados->>'nome'), '');
  v_atividade text := nullif(btrim(p_dados->>'atividade'), '');
  v_cidade    text := nullif(btrim(p_dados->>'cidade'), '');
  v_telefone  text := nullif(btrim(p_dados->>'telefone'), '');
  v_chave_pix text := nullif(btrim(p_dados->>'chave_pix'), '');
  v_mei       public.meis;
begin
  update public.meis m
  set nome      = coalesce(v_nome, m.nome),
      atividade = coalesce(v_atividade, m.atividade),
      cidade    = coalesce(v_cidade, m.cidade),
      telefone  = coalesce(v_telefone, m.telefone),
      chave_pix = coalesce(v_chave_pix, m.chave_pix)
  where m.user_id = p_user
  returning m.* into v_mei;
  if found then
    return v_mei;
  end if;

  if v_nome is null then
    raise exception 'regra: informe o nome do negócio';
  end if;

  -- `on conflict`: dois envios simultâneos do 1º cadastro viram um MEI só.
  insert into public.meis as m (user_id, nome, atividade, cidade, telefone, chave_pix)
  values (p_user, v_nome, v_atividade, v_cidade, v_telefone, v_chave_pix)
  on conflict (user_id) do update
    set nome      = excluded.nome,
        atividade = coalesce(excluded.atividade, m.atividade),
        cidade    = coalesce(excluded.cidade, m.cidade),
        telefone  = coalesce(excluded.telefone, m.telefone),
        chave_pix = coalesce(excluded.chave_pix, m.chave_pix)
  returning m.* into v_mei;

  return v_mei;
end;
$$;

-- O MEI do usuário, ou null se ele ainda não cadastrou o negócio.
create or replace function public.mei_do_usuario(p_user uuid)
returns public.meis
language sql
stable
set search_path = ''
as $$
  select m from public.meis m where m.user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Clientes do MEI
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  nome          text not null,
  -- Sempre normalizado por so_digitos(); null quando não informado.
  whatsapp      text,
  endereco      text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um cadastro por telefone dentro do MEI. Parcial: vários clientes podem ficar
-- sem WhatsApp. É também o índice das consultas por MEI.
create unique index if not exists clientes_mei_whatsapp_idx
  on public.clientes (mei_id, whatsapp)
  where whatsapp is not null;

create index if not exists clientes_mei_idx on public.clientes (mei_id);

alter table public.clientes enable row level security;

-- Cadastra ou atualiza um cliente.
-- p_dados: {id?, nome?, whatsapp?, endereco?, observacoes?}
--  - com `id`: atualiza esse cliente (tem de ser do MEI);
--  - sem `id`: casa pelo WhatsApp normalizado e atualiza; se não houver, cria.
-- Campo ausente (ou em branco) não apaga o que já estava gravado.
create or replace function public.cliente_salvar(p_mei uuid, p_dados jsonb)
returns public.clientes
language plpgsql
set search_path = ''
as $$
declare
  v_tem_id      boolean := coalesce(p_dados ? 'id', false) and jsonb_typeof(p_dados->'id') <> 'null';
  v_id_texto    text := p_dados->>'id';
  v_nome        text := nullif(btrim(p_dados->>'nome'), '');
  v_whatsapp    text := nullif(public.so_digitos(p_dados->>'whatsapp'), '');
  v_endereco    text := nullif(btrim(p_dados->>'endereco'), '');
  v_observacoes text := nullif(btrim(p_dados->>'observacoes'), '');
  v_id          uuid;
  v_cliente     public.clientes;
begin
  if v_tem_id then
    -- O id vem do modelo: texto que nem uuid é vale como id inexistente.
    if v_id_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.id into v_id
      from public.clientes c
      where c.id = v_id_texto::uuid and c.mei_id = p_mei
      for update;
    end if;
    if v_id is null then
      raise exception 'regra: cliente não encontrado';
    end if;
  elsif v_whatsapp is not null then
    select c.id into v_id
    from public.clientes c
    where c.mei_id = p_mei and c.whatsapp = v_whatsapp
    for update;
  end if;

  if v_id is not null then
    begin
      update public.clientes c
      set nome          = coalesce(v_nome, c.nome),
          whatsapp      = coalesce(v_whatsapp, c.whatsapp),
          endereco      = coalesce(v_endereco, c.endereco),
          observacoes   = coalesce(v_observacoes, c.observacoes),
          atualizado_em = now()
      where c.id = v_id and c.mei_id = p_mei
      returning c.* into v_cliente;
    exception when unique_violation then
      raise exception 'regra: já existe outro cliente com esse WhatsApp';
    end;
    return v_cliente;
  end if;

  if v_nome is null then
    raise exception 'regra: informe o nome do cliente';
  end if;

  -- `on conflict`: duas chamadas simultâneas com o mesmo telefone novo viram
  -- um cadastro só, em vez de a 2ª estourar o índice único.
  insert into public.clientes as c (mei_id, nome, whatsapp, endereco, observacoes)
  values (p_mei, v_nome, v_whatsapp, v_endereco, v_observacoes)
  on conflict (mei_id, whatsapp) where whatsapp is not null do update
    set nome          = excluded.nome,
        endereco      = coalesce(excluded.endereco, c.endereco),
        observacoes   = coalesce(excluded.observacoes, c.observacoes),
        atualizado_em = now()
  returning c.* into v_cliente;

  return v_cliente;
end;
$$;

-- Clientes do MEI cujo nome contém o termo (sem acento nem caixa) ou, quando o
-- termo é um telefone, cujo WhatsApp contém os dígitos. Termo vazio lista os
-- clientes. No máximo 10, em ordem de nome.
create or replace function public.cliente_buscar(p_mei uuid, p_termo text)
returns setof public.clientes
language sql
stable
set search_path = ''
as $$
  with t as (
    select
      -- Curingas do like digitados no termo valem como texto comum.
      regexp_replace(public.sem_acento(btrim(coalesce(p_termo, ''))), '([\\%_])', '\\\1', 'g') as nome,
      -- Só trata como telefone o termo sem letras ("62 99999-0000", não "Maria 2").
      case
        when coalesce(p_termo, '') ~ '^[\d\s()+.-]+$' then public.so_digitos(p_termo)
        else ''
      end as digitos
  )
  select c.*
  from public.clientes c, t
  where c.mei_id = p_mei
    and (
      public.sem_acento(c.nome) like '%' || t.nome || '%'
      or (t.digitos <> '' and c.whatsapp like '%' || t.digitos || '%')
    )
  order by public.sem_acento(c.nome), c.criado_em, c.id
  limit 10;
$$;

revoke execute on function public.sem_acento(text) from public, anon, authenticated;
revoke execute on function public.so_digitos(text) from public, anon, authenticated;
revoke execute on function public.mei_salvar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.mei_do_usuario(uuid) from public, anon, authenticated;
revoke execute on function public.cliente_salvar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.cliente_buscar(uuid, text) from public, anon, authenticated;
grant execute on function public.sem_acento(text) to service_role;
grant execute on function public.so_digitos(text) to service_role;
grant execute on function public.mei_salvar(uuid, jsonb) to service_role;
grant execute on function public.mei_do_usuario(uuid) to service_role;
grant execute on function public.cliente_salvar(uuid, jsonb) to service_role;
grant execute on function public.cliente_buscar(uuid, text) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
