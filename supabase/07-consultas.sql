-- Consultas somente de leitura das telas do painel. Executar após 04-documentos.sql.

create or replace function public.cliente_listar(p_mei uuid)
returns setof public.clientes
language sql stable set search_path = ''
as $$
  select c.* from public.clientes c
  where c.mei_id = p_mei
  order by c.nome, c.criado_em, c.id;
$$;

create or replace function public.documentos_listar(p_mei uuid)
returns table (
  id uuid, tipo text, status text, numero int, descricao text,
  cliente_nome text, valor numeric, criado_em timestamptz
)
language sql stable set search_path = ''
as $$
  select o.id, 'orcamento'::text, o.status, o.numero, s.descricao,
         c.nome, o.valor, o.criado_em
  from public.orcamentos o
  join public.servicos s on s.id = o.servico_id and s.mei_id = p_mei
  join public.clientes c on c.id = s.cliente_id and c.mei_id = p_mei
  where o.mei_id = p_mei
  union all
  select ct.id, 'contrato'::text, ct.status, s.numero, s.descricao,
         c.nome, s.valor, ct.criado_em
  from public.contratos ct
  join public.servicos s on s.id = ct.servico_id and s.mei_id = p_mei
  join public.clientes c on c.id = s.cliente_id and c.mei_id = p_mei
  where ct.mei_id = p_mei
  order by criado_em desc, id;
$$;

create or replace function public.mensagens_listar(p_mei uuid, p_status text default null)
returns table (
  id uuid, cliente_id uuid, servico_id uuid, canal text, objetivo text,
  conteudo text, status text, criado_em timestamptz,
  cliente_nome text, cliente_whatsapp text
)
language sql stable set search_path = ''
as $$
  select m.id, m.cliente_id, m.servico_id, m.canal, m.objetivo,
         m.conteudo, m.status, m.criado_em, c.nome, c.whatsapp
  from public.mensagens m
  left join public.clientes c on c.id = m.cliente_id and c.mei_id = p_mei
  where m.mei_id = p_mei
    and (nullif(btrim(p_status), '') is null or m.status = lower(btrim(p_status)))
  order by m.criado_em desc, m.id;
$$;

revoke execute on function public.cliente_listar(uuid) from public, anon, authenticated;
revoke execute on function public.documentos_listar(uuid) from public, anon, authenticated;
revoke execute on function public.mensagens_listar(uuid, text) from public, anon, authenticated;
grant execute on function public.cliente_listar(uuid) to service_role;
grant execute on function public.documentos_listar(uuid) to service_role;
grant execute on function public.mensagens_listar(uuid, text) to service_role;

notify pgrst, 'reload schema';
