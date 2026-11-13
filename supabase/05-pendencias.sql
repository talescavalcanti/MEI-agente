-- ============================================================================
-- MEIagente — pendências (propostas paradas) e tarefas de follow-up
-- Rode no SQL Editor do Supabase, depois do 04-documentos.sql. Idempotente.
--
-- Mesma postura dos anteriores: RLS ligado e SEM políticas; toda função de
-- domínio recebe `p_mei` e filtra por ele (id de outro MEI = id inexistente);
-- violação de regra é `raise exception 'regra: <frase para o usuário>'`.
--
-- Proposta parada: serviço `aguardando_resposta` cujo orçamento foi enviado
-- (orcamentos.enviado_em, preenchido por mensagem_marcar_enviada) há `p_dias`
-- ou mais. O agendador (tarefas_gerar_followups) abre uma tarefa por proposta
-- parada; o usuário fecha a tarefa (feita / ignorada) ou ela fica `feita`
-- quando a mensagem ligada a ela é marcada como enviada (04-documentos.sql).
--
-- Quando o agendador volta a abrir tarefa para o mesmo serviço:
--   ignorada → no dia seguinte (o serviço continua em propostas_pendentes)
--   feita    → depois de `p_dias` dias da tarefa (o cliente já foi lembrado)
-- "Hoje" é sempre a data em America/Sao_Paulo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------------
create table if not exists public.tarefas (
  id         uuid primary key default gen_random_uuid(),
  mei_id     uuid not null references public.meis (id) on delete cascade,
  servico_id uuid not null references public.servicos (id) on delete cascade,
  tipo       text not null check (tipo in ('follow_up_orcamento')),
  vencimento date not null,
  status     text not null default 'aberta' check (status in ('aberta', 'feita', 'ignorada')),
  criado_em  timestamptz not null default now()
);

-- No máximo uma tarefa aberta por serviço e tipo (agendador rodando em dobro).
create unique index if not exists tarefas_aberta_unica on public.tarefas (servico_id, tipo) where status = 'aberta';
create index if not exists tarefas_mei_status_idx on public.tarefas (mei_id, status);

alter table public.tarefas enable row level security;

-- mensagens.tarefa_id (04-documentos.sql) passa a apontar para tarefas.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mensagens_tarefa_id_fkey' and conrelid = 'public.mensagens'::regclass
  ) then
    -- Referência que não existe mais (de antes da chave) vira null.
    update public.mensagens m
    set tarefa_id = null
    where m.tarefa_id is not null
      and not exists (select 1 from public.tarefas t where t.id = m.tarefa_id);

    alter table public.mensagens
      add constraint mensagens_tarefa_id_fkey
      foreign key (tarefa_id) references public.tarefas (id) on delete set null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Hoje em America/Sao_Paulo.
create or replace function public.hoje_sp()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Mensagem só aponta para tarefa do mesmo MEI. Sem isso, um id inventado (ou
-- de outro MEI) viraria erro de chave estrangeira em vez de regra.
create or replace function public.mensagens_tarefa_valida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tarefa_id is not null and not exists (
    select 1 from public.tarefas t where t.id = new.tarefa_id and t.mei_id = new.mei_id
  ) then
    raise exception 'regra: tarefa não encontrada';
  end if;
  return new;
end;
$$;

drop trigger if exists mensagens_tarefa_valida on public.mensagens;
create trigger mensagens_tarefa_valida
  before insert or update of tarefa_id on public.mensagens
  for each row execute function public.mensagens_tarefa_valida();

-- Dias mínimos parados: inteiro >= 0.
create or replace function public.pendencia_dias_validos(p_dias int)
returns int
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_dias is null then
    return 3;
  end if;
  if p_dias < 0 or p_dias > 365 then
    raise exception 'regra: os dias sem resposta precisam ser entre 0 e 365';
  end if;
  return p_dias;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções de domínio
-- ---------------------------------------------------------------------------

-- Propostas paradas do MEI: serviço `aguardando_resposta` com orçamento enviado
-- há `p_dias` ou mais. `dias_parado` conta pela data de hoje em São Paulo;
-- `tarefa_id` é a tarefa de follow-up aberta, se houver. Mais antigas primeiro.
create or replace function public.propostas_pendentes(p_mei uuid, p_dias int default 3)
returns table (
  servico_id       uuid,
  numero           int,
  descricao        text,
  valor            numeric,
  cliente_id       uuid,
  cliente_nome     text,
  cliente_whatsapp text,
  enviado_em       timestamptz,
  dias_parado      int,
  tarefa_id        uuid
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_dias int := public.pendencia_dias_validos(p_dias);
begin
  return query
  select s.id, s.numero, s.descricao, s.valor,
         c.id, c.nome, c.whatsapp,
         o.enviado_em,
         (public.hoje_sp() - (o.enviado_em at time zone 'America/Sao_Paulo')::date)::int,
         t.id
  from public.servicos s
  join public.orcamentos o on o.servico_id = s.id and o.mei_id = s.mei_id
  join public.clientes c on c.id = s.cliente_id and c.mei_id = s.mei_id
  left join public.tarefas t
    on t.servico_id = s.id and t.tipo = 'follow_up_orcamento' and t.status = 'aberta'
  where s.mei_id = p_mei
    and s.status = 'aguardando_resposta'
    and o.enviado_em is not null
    and o.enviado_em <= now() - make_interval(days => v_dias)
  order by o.enviado_em, s.numero;
end;
$$;

-- Agendador (todos os MEIs): abre tarefa de follow-up para cada proposta
-- parada que não tem tarefa aberta, nem tarefa ignorada hoje, nem tarefa feita
-- há menos de `p_dias` dias. Devolve só as tarefas criadas nesta rodada; rodar
-- de novo não duplica.
create or replace function public.tarefas_gerar_followups(p_dias int default 3)
returns table (mei_id uuid, tarefa_id uuid, servico_id uuid)
language plpgsql
set search_path = ''
as $$
-- O `on conflict (servico_id, tipo)` fala da coluna, não do parâmetro de saída.
#variable_conflict use_column
declare
  v_dias int := public.pendencia_dias_validos(p_dias);
  v_hoje date := public.hoje_sp();
begin
  return query
  with candidatos as (
    select s.mei_id, s.id as servico_id
    from public.servicos s
    join public.orcamentos o on o.servico_id = s.id and o.mei_id = s.mei_id
    where s.status = 'aguardando_resposta'
      and o.enviado_em is not null
      and o.enviado_em <= now() - make_interval(days => v_dias)
      and not exists (
        select 1 from public.tarefas t
        where t.servico_id = s.id
          and t.tipo = 'follow_up_orcamento'
          and (
            t.status = 'aberta'
            or (t.status = 'ignorada' and (t.criado_em at time zone 'America/Sao_Paulo')::date = v_hoje)
            or (t.status = 'feita' and (t.criado_em at time zone 'America/Sao_Paulo')::date > v_hoje - v_dias)
          )
      )
  ),
  novas as (
    insert into public.tarefas as t (mei_id, servico_id, tipo, vencimento)
    select c.mei_id, c.servico_id, 'follow_up_orcamento', v_hoje
    from candidatos c
    on conflict (servico_id, tipo) where status = 'aberta' do nothing
    returning t.mei_id, t.id, t.servico_id
  )
  select n.mei_id, n.id, n.servico_id from novas n;
end;
$$;

-- O usuário fecha a tarefa: `feita` ou `ignorada`. Tarefa já fechada volta
-- como está (clique duplo é inofensivo).
create or replace function public.tarefa_fechar(p_mei uuid, p_id uuid, p_status text)
returns public.tarefas
language plpgsql
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_tarefa public.tarefas;
begin
  if v_status not in ('feita', 'ignorada') then
    raise exception 'regra: status de tarefa inválido (use feita ou ignorada)';
  end if;

  select t.* into v_tarefa
  from public.tarefas t
  where t.id = p_id and t.mei_id = p_mei
  for update;
  if v_tarefa.id is null then
    raise exception 'regra: tarefa não encontrada';
  end if;
  if v_tarefa.status <> 'aberta' then
    return v_tarefa;
  end if;

  update public.tarefas t
  set status = v_status
  where t.id = v_tarefa.id
  returning t.* into v_tarefa;
  return v_tarefa;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.hoje_sp() from public, anon, authenticated;
revoke execute on function public.mensagens_tarefa_valida() from public, anon, authenticated;
revoke execute on function public.pendencia_dias_validos(int) from public, anon, authenticated;
revoke execute on function public.propostas_pendentes(uuid, int) from public, anon, authenticated;
revoke execute on function public.tarefas_gerar_followups(int) from public, anon, authenticated;
revoke execute on function public.tarefa_fechar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hoje_sp() to service_role;
grant execute on function public.pendencia_dias_validos(int) to service_role;
grant execute on function public.propostas_pendentes(uuid, int) to service_role;
grant execute on function public.tarefas_gerar_followups(int) to service_role;
grant execute on function public.tarefa_fechar(uuid, uuid, text) to service_role;

-- O PostgREST precisa enxergar a tabela e as funções novas sem esperar.
notify pgrst, 'reload schema';
