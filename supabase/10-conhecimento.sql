-- ============================================================================
-- MEIagente — base de conhecimento do negócio (busca para o agente)
-- Rode no SQL Editor do Supabase, depois do 08-proatividade.sql (e do 09-*,
-- se houver). Idempotente.
--
-- Notas e histórico de atendimento por cliente, preços praticados, perguntas
-- frequentes e políticas do negócio. O agente consulta com a ferramenta
-- consultar_conhecimento antes de responder.
--
-- Busca em português por texto (full-text do Postgres, sem acento), sem
-- embeddings e sem API paga. Mesma postura dos anteriores: toda função recebe
-- `p_mei` primeiro e filtra por ele; violação de regra é
-- `raise exception 'regra: <frase para o usuário>'`; só o servidor
-- (service_role) chama. Depende de 02-clientes.sql (meis, clientes, sem_acento).
-- ============================================================================

create table if not exists public.conhecimento (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  -- Só em nota_cliente e atendimento.
  cliente_id    uuid references public.clientes (id) on delete cascade,
  tipo          text not null check (tipo in ('nota_cliente', 'atendimento', 'preco', 'faq', 'politica')),
  titulo        text not null check (char_length(titulo) between 1 and 200),
  conteudo      text not null check (char_length(conteudo) between 1 and 4000),
  -- Calculado no conhecimento_salvar (sem_acento é stable, não serve para
  -- coluna gerada). Por isso renomear o cliente NÃO reindexa as notas dele:
  -- a busca pelo nome novo só acha depois que a nota for salva de novo.
  busca         tsvector not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists conhecimento_busca_idx on public.conhecimento using gin (busca);
create index if not exists conhecimento_mei_tipo_idx on public.conhecimento (mei_id, tipo);
-- Chave do upsert: o mesmo título (sem diferença de caixa), do mesmo tipo e
-- cliente, é o mesmo item.
create unique index if not exists conhecimento_item_unico on public.conhecimento (
  mei_id, tipo, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(titulo)
);

alter table public.conhecimento enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Tipo de conhecimento em minúsculas; nulo ou em branco volta nulo.
create or replace function public.conhecimento_tipo_valido(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tipo text := lower(nullif(btrim(coalesce(p_texto, '')), ''));
begin
  if v_tipo is not null and v_tipo not in ('nota_cliente', 'atendimento', 'preco', 'faq', 'politica') then
    raise exception 'regra: tipo de conhecimento inválido (use nota_cliente, atendimento, preco, faq ou politica)';
  end if;
  return v_tipo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Grava (ou atualiza) um item. p_dados: {tipo, titulo, conteudo, cliente_id?}.
-- Título com espaços repetidos vira um espaço só. O mesmo tipo, cliente e
-- título atualiza o conteúdo em vez de duplicar.
create or replace function public.conhecimento_salvar(p_mei uuid, p_dados jsonb)
returns public.conhecimento
language plpgsql
set search_path = ''
as $$
declare
  v_tipo     text := public.conhecimento_tipo_valido(p_dados->>'tipo');
  v_titulo   text := btrim(regexp_replace(coalesce(p_dados->>'titulo', ''), '\s+', ' ', 'g'));
  v_conteudo text := btrim(coalesce(p_dados->>'conteudo', ''));
  v_cliente  public.clientes;
  v_busca    tsvector;
  v_item     public.conhecimento;
begin
  if v_tipo is null then
    raise exception 'regra: tipo de conhecimento inválido (use nota_cliente, atendimento, preco, faq ou politica)';
  end if;
  if v_titulo = '' then
    raise exception 'regra: informe o título';
  end if;
  if char_length(v_titulo) > 200 then
    raise exception 'regra: o título passou de 200 caracteres';
  end if;
  if v_conteudo = '' then
    raise exception 'regra: informe o conteúdo';
  end if;
  if char_length(v_conteudo) > 4000 then
    raise exception 'regra: o conteúdo passou de 4000 caracteres';
  end if;
  if not exists (select 1 from public.meis m where m.id = p_mei) then
    raise exception 'regra: negócio não encontrado';
  end if;

  if nullif(btrim(p_dados->>'cliente_id'), '') is not null then
    select c.* into v_cliente
    from public.clientes c
    where c.id = public.uuid_ou_nulo(p_dados->>'cliente_id') and c.mei_id = p_mei;
    if v_cliente.id is null then
      raise exception 'regra: cliente não encontrado';
    end if;
  elsif v_tipo in ('nota_cliente', 'atendimento') then
    raise exception 'regra: informe o cliente desta nota';
  end if;

  -- Título e nome do cliente pesam mais que o conteúdo.
  v_busca :=
    setweight(to_tsvector('portuguese', public.sem_acento(v_titulo || ' ' || coalesce(v_cliente.nome, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.sem_acento(v_conteudo)), 'B');

  insert into public.conhecimento as k (mei_id, cliente_id, tipo, titulo, conteudo, busca)
  values (p_mei, v_cliente.id, v_tipo, v_titulo, v_conteudo, v_busca)
  on conflict (mei_id, tipo, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(titulo))
  do update
    set titulo        = excluded.titulo,
        conteudo      = excluded.conteudo,
        busca         = excluded.busca,
        atualizado_em = now()
  returning k.* into v_item;

  return v_item;
end;
$$;

-- Busca no conhecimento do MEI. Os termos (sem acento, sem palavras vazias,
-- reduzidos ao radical em português) entram com OU; quem casa mais termos, e
-- no título, vem primeiro. Filtros opcionais por cliente e por tipo. Limite de
-- 1 a 10 (padrão 5). Conteúdo cortado em 600 caracteres (o modelo tem 32k de
-- contexto). Nada encontrado é lista vazia, não erro.
create or replace function public.conhecimento_buscar(
  p_mei     uuid,
  p_termo   text,
  p_cliente uuid default null,
  p_tipo    text default null,
  p_limite  int default 5
)
returns table (
  id           uuid,
  tipo         text,
  titulo       text,
  conteudo     text,
  cliente_id   uuid,
  cliente_nome text,
  relevancia   real
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo   text := public.conhecimento_tipo_valido(p_tipo);
  v_limite int := least(greatest(coalesce(p_limite, 5), 1), 10);
  v_and    text;
  v_query  tsquery;
begin
  if btrim(coalesce(p_termo, '')) = '' then
    raise exception 'regra: informe o que buscar';
  end if;

  -- plainto_tsquery junta os termos com E; aqui viram OU.
  v_and := plainto_tsquery('portuguese', public.sem_acento(p_termo))::text;
  if v_and = '' then
    return;
  end if;
  v_query := replace(v_and, ' & ', ' | ')::tsquery;

  return query
  select
    k.id,
    k.tipo,
    k.titulo,
    case when char_length(k.conteudo) > 600 then left(k.conteudo, 600) || '…' else k.conteudo end,
    k.cliente_id,
    c.nome,
    ts_rank(k.busca, v_query)
  from public.conhecimento k
  left join public.clientes c on c.id = k.cliente_id and c.mei_id = k.mei_id
  where k.mei_id = p_mei
    and k.busca @@ v_query
    and (p_cliente is null or k.cliente_id = p_cliente)
    and (v_tipo is null or k.tipo = v_tipo)
  order by ts_rank(k.busca, v_query) desc, k.atualizado_em desc, k.id
  limit v_limite;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.conhecimento_tipo_valido(text) from public, anon, authenticated;
revoke execute on function public.conhecimento_salvar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.conhecimento_buscar(uuid, text, uuid, text, int) from public, anon, authenticated;
grant execute on function public.conhecimento_tipo_valido(text) to service_role;
grant execute on function public.conhecimento_salvar(uuid, jsonb) to service_role;
grant execute on function public.conhecimento_buscar(uuid, text, uuid, text, int) to service_role;

notify pgrst, 'reload schema';
