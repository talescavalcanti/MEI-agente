-- ============================================================================
-- MEIagente — proatividade: lembretes de propostas paradas e Início
-- Rode no SQL Editor do Supabase, depois do 07-consultas.sql. Idempotente.
--
-- Só leitura. Mesma postura dos anteriores: toda função de domínio recebe
-- `p_mei` e filtra por ele; só o servidor (service_role) chama.
--
-- O lembrete de uma tarefa de follow-up (05-pendencias.sql) é a mensagem com
-- `tarefa_id` dela. O agendador pede ao agente um lembrete para cada tarefa
-- aberta que ainda não tem mensagem ligada (qualquer status: um lembrete
-- descartado não é redigido de novo; para parar de lembrar, ignore a tarefa).
-- ============================================================================

-- O MEI pelo id (o agendador só tem o id; o painel usa mei_do_usuario).
create or replace function public.mei_por_id(p_mei uuid)
returns public.meis
language sql
stable
set search_path = ''
as $$
  select m.* from public.meis m where m.id = p_mei;
$$;

-- Tarefas abertas de propostas ainda paradas, sem lembrete redigido. Mais
-- antigas primeiro, no máximo `p_limite`.
create or replace function public.followups_sem_lembrete(p_mei uuid, p_limite int default 5)
returns table (
  tarefa_id    uuid,
  servico_id   uuid,
  numero       int,
  descricao    text,
  valor        numeric,
  cliente_id   uuid,
  cliente_nome text,
  dias_parado  int
)
language sql
stable
set search_path = ''
as $$
  select p.tarefa_id, p.servico_id, p.numero, p.descricao, p.valor,
         p.cliente_id, p.cliente_nome, p.dias_parado
  from public.propostas_pendentes(p_mei, 0) p
  where p.tarefa_id is not null
    and not exists (
      select 1 from public.mensagens m
      where m.tarefa_id = p.tarefa_id and m.mei_id = p_mei
    )
  order by p.enviado_em, p.numero
  limit greatest(coalesce(p_limite, 5), 0);
$$;

-- Agendador (todos os MEIs): os MEIs com alguma tarefa aberta sem lembrete.
create or replace function public.followups_meis_pendentes()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select distinct t.mei_id
  from public.tarefas t
  join public.servicos s on s.id = t.servico_id and s.mei_id = t.mei_id
  where t.status = 'aberta'
    and t.tipo = 'follow_up_orcamento'
    and s.status = 'aguardando_resposta'
    and not exists (select 1 from public.mensagens m where m.tarefa_id = t.id)
  order by 1;
$$;

-- Propostas paradas para o Início: as de propostas_pendentes que têm tarefa
-- aberta, ou que nunca tiveram tarefa (o agendador ainda não passou). Some
-- quem já foi ignorada ou lembrada, até o agendador abrir tarefa de novo.
-- `mensagem_id`/`mensagem_status`: o lembrete mais recente da tarefa aberta.
create or replace function public.propostas_paradas(p_mei uuid, p_dias int default 3)
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
  tarefa_id        uuid,
  mensagem_id      uuid,
  mensagem_status  text
)
language sql
stable
set search_path = ''
as $$
  select p.servico_id, p.numero, p.descricao, p.valor, p.cliente_id, p.cliente_nome,
         p.cliente_whatsapp, p.enviado_em, p.dias_parado, p.tarefa_id,
         l.id, l.status
  from public.propostas_pendentes(p_mei, p_dias) p
  left join lateral (
    select m.id, m.status
    from public.mensagens m
    where p.tarefa_id is not null and m.tarefa_id = p.tarefa_id and m.mei_id = p_mei
    order by m.criado_em desc, m.id desc
    limit 1
  ) l on true
  where p.tarefa_id is not null
     or not exists (
       select 1 from public.tarefas t
       where t.servico_id = p.servico_id and t.mei_id = p_mei and t.tipo = 'follow_up_orcamento'
     )
  order by p.enviado_em, p.numero;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.mei_por_id(uuid) from public, anon, authenticated;
revoke execute on function public.followups_sem_lembrete(uuid, int) from public, anon, authenticated;
revoke execute on function public.followups_meis_pendentes() from public, anon, authenticated;
revoke execute on function public.propostas_paradas(uuid, int) from public, anon, authenticated;
grant execute on function public.mei_por_id(uuid) to service_role;
grant execute on function public.followups_sem_lembrete(uuid, int) to service_role;
grant execute on function public.followups_meis_pendentes() to service_role;
grant execute on function public.propostas_paradas(uuid, int) to service_role;

notify pgrst, 'reload schema';
