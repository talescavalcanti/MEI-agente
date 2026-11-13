-- ============================================================================
-- MEIagente — serviços, agenda, pagamentos e máquina de estados
-- Rode no SQL Editor do Supabase, depois do 02-clientes.sql. Idempotente.
--
-- Mesma postura do 02-clientes.sql: RLS ligado e SEM políticas; toda função
-- recebe `p_mei` e filtra por ele (id de outro MEI = id inexistente); violação
-- de regra é `raise exception 'regra: <frase para o usuário>'`.
--
-- Estados de um serviço:
--   rascunho → orcado → aguardando_resposta → confirmado → agendado → executado → pago
--   (+ cancelado, a partir de qualquer estado que não seja pago)
-- `orcado` e `aguardando_resposta` vêm do 04-documentos.sql (orçamento gerado e
-- enviado); `agendado` só por servico_agendar; `pago` só por pagamento_registrar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Serviços (pedidos) do MEI
-- ---------------------------------------------------------------------------
create table if not exists public.servicos (
  id              uuid primary key default gen_random_uuid(),
  mei_id          uuid not null references public.meis (id) on delete cascade,
  cliente_id      uuid not null references public.clientes (id) on delete cascade,
  -- Sequencial por MEI (1, 2, 3...), para o usuário se referir ao serviço.
  numero          int not null,
  descricao       text not null,
  valor           numeric(12, 2) check (valor > 0),
  data_prevista   date,
  local           text,
  forma_pagamento text check (forma_pagamento in ('pix', 'dinheiro', 'cartao', 'parcelado', 'outro')),
  status          text not null default 'rascunho' check (status in (
    'rascunho', 'orcado', 'aguardando_resposta', 'confirmado', 'agendado', 'executado', 'pago', 'cancelado'
  )),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (mei_id, numero)
);

create index if not exists servicos_cliente_idx on public.servicos (cliente_id);
create index if not exists servicos_mei_status_idx on public.servicos (mei_id, status);

alter table public.servicos enable row level security;

-- Agendamento do serviço. Um por serviço: reagendar substitui.
create table if not exists public.agendamentos (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  servico_id    uuid not null unique references public.servicos (id) on delete cascade,
  inicio        timestamptz not null,
  local         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists agendamentos_mei_inicio_idx on public.agendamentos (mei_id, inicio);

alter table public.agendamentos enable row level security;

-- Recebimentos lançados no serviço.
create table if not exists public.pagamentos (
  id         uuid primary key default gen_random_uuid(),
  mei_id     uuid not null references public.meis (id) on delete cascade,
  servico_id uuid not null references public.servicos (id) on delete cascade,
  valor      numeric(12, 2) not null check (valor > 0),
  forma      text check (forma in ('pix', 'dinheiro', 'cartao', 'parcelado', 'outro')),
  criado_em  timestamptz not null default now()
);

create index if not exists pagamentos_servico_idx on public.pagamentos (servico_id);

alter table public.pagamentos enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares (validação dos dados que vêm do modelo)
-- ---------------------------------------------------------------------------

-- Texto em uuid, ou null se não for um uuid (id inventado vale como inexistente).
create or replace function public.uuid_ou_nulo(p_texto text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_texto::uuid
  end;
$$;

-- Valor em reais > 0, ou null se ausente/em branco. Inválido é regra.
create or replace function public.servico_valor_valido(p_texto text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if nullif(btrim(p_texto), '') is null then
    return null;
  end if;
  begin
    v := round(btrim(p_texto)::numeric, 2);
  exception when others then
    raise exception 'regra: o valor precisa ser maior que zero';
  end;
  if v = 'NaN'::numeric or v <= 0 then
    raise exception 'regra: o valor precisa ser maior que zero';
  end if;
  if v >= 10000000000 then
    raise exception 'regra: o valor está alto demais';
  end if;
  return v;
end;
$$;

-- Forma de pagamento válida, ou null se ausente/em branco.
create or replace function public.forma_pagamento_valida(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(nullif(btrim(p_texto), ''));
begin
  if v is not null and v not in ('pix', 'dinheiro', 'cartao', 'parcelado', 'outro') then
    raise exception 'regra: forma de pagamento inválida (use pix, dinheiro, cartao, parcelado ou outro)';
  end if;
  return v;
end;
$$;

-- Data AAAA-MM-DD, ou null se ausente/em branco.
create or replace function public.data_prevista_valida(p_texto text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(btrim(p_texto), '') is null then
    return null;
  end if;
  if btrim(p_texto) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'regra: data prevista inválida (use AAAA-MM-DD)';
  end if;
  begin
    return btrim(p_texto)::date;
  exception when others then
    raise exception 'regra: data prevista inválida (use AAAA-MM-DD)';
  end;
end;
$$;

-- Serviço do MEI, travado para alteração. Não achou = regra.
create or replace function public.servico_do_mei(p_mei uuid, p_id uuid)
returns public.servicos
language plpgsql
set search_path = ''
as $$
declare
  v public.servicos;
begin
  select s.* into v
  from public.servicos s
  where s.id = p_id and s.mei_id = p_mei
  for update;
  if not found then
    raise exception 'regra: serviço não encontrado';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções de domínio
-- ---------------------------------------------------------------------------

-- Registra um serviço novo.
-- p_dados: {cliente_id, descricao, valor?, data_prevista?, local?, forma_pagamento?, fechado?}
-- `fechado = true` (o cliente já fechou) nasce `confirmado`; senão `rascunho`.
create or replace function public.servico_registrar(p_mei uuid, p_dados jsonb)
returns public.servicos
language plpgsql
set search_path = ''
as $$
declare
  v_cliente   uuid;
  v_descricao text := nullif(btrim(p_dados->>'descricao'), '');
  v_valor     numeric := public.servico_valor_valido(p_dados->>'valor');
  v_data      date := public.data_prevista_valida(p_dados->>'data_prevista');
  v_local     text := nullif(btrim(p_dados->>'local'), '');
  v_forma     text := public.forma_pagamento_valida(p_dados->>'forma_pagamento');
  v_fechado   boolean := coalesce(jsonb_typeof(p_dados->'fechado') = 'boolean' and (p_dados->'fechado')::boolean, false);
  v_numero    int;
  v_servico   public.servicos;
begin
  select c.id into v_cliente
  from public.clientes c
  where c.id = public.uuid_ou_nulo(p_dados->>'cliente_id') and c.mei_id = p_mei;
  if v_cliente is null then
    raise exception 'regra: cliente não encontrado';
  end if;

  if v_descricao is null then
    raise exception 'regra: informe a descrição do serviço';
  end if;

  -- Trava o MEI: dois registros simultâneos não pegam o mesmo número.
  perform 1 from public.meis m where m.id = p_mei for update;
  select coalesce(max(s.numero), 0) + 1 into v_numero
  from public.servicos s
  where s.mei_id = p_mei;

  insert into public.servicos (mei_id, cliente_id, numero, descricao, valor, data_prevista, local, forma_pagamento, status)
  values (p_mei, v_cliente, v_numero, v_descricao, v_valor, v_data, v_local, v_forma,
          case when v_fechado then 'confirmado' else 'rascunho' end)
  returning * into v_servico;

  return v_servico;
end;
$$;

-- Atualiza os dados do serviço. Campo ausente (ou em branco) não apaga o que já
-- estava. Não troca cliente nem status. Recusado em serviço pago ou cancelado.
-- p_dados: {descricao?, valor?, data_prevista?, local?, forma_pagamento?}
create or replace function public.servico_atualizar(p_mei uuid, p_id uuid, p_dados jsonb)
returns public.servicos
language plpgsql
set search_path = ''
as $$
declare
  v_atual     public.servicos := public.servico_do_mei(p_mei, p_id);
  v_descricao text := nullif(btrim(p_dados->>'descricao'), '');
  v_valor     numeric := public.servico_valor_valido(p_dados->>'valor');
  v_data      date := public.data_prevista_valida(p_dados->>'data_prevista');
  v_local     text := nullif(btrim(p_dados->>'local'), '');
  v_forma     text := public.forma_pagamento_valida(p_dados->>'forma_pagamento');
  v_servico   public.servicos;
begin
  if v_atual.status = 'pago' then
    raise exception 'regra: este serviço já foi pago e não pode mais ser alterado';
  elsif v_atual.status = 'cancelado' then
    raise exception 'regra: este serviço foi cancelado e não pode mais ser alterado';
  end if;

  update public.servicos s
  set descricao       = coalesce(v_descricao, s.descricao),
      valor           = coalesce(v_valor, s.valor),
      data_prevista   = coalesce(v_data, s.data_prevista),
      local           = coalesce(v_local, s.local),
      forma_pagamento = coalesce(v_forma, s.forma_pagamento),
      atualizado_em   = now()
  where s.id = v_atual.id
  returning s.* into v_servico;

  return v_servico;
end;
$$;

-- O que ainda falta para fechar o serviço, sempre nesta ordem:
-- cliente.whatsapp, cliente.endereco (só se o serviço também não tiver local),
-- servico.valor, servico.data_prevista, servico.forma_pagamento.
create or replace function public.servico_faltantes(p_mei uuid, p_id uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_falta text[] := '{}';
  r record;
begin
  select s.valor, s.data_prevista, s.local, s.forma_pagamento, c.whatsapp, c.endereco
  into r
  from public.servicos s
  join public.clientes c on c.id = s.cliente_id
  where s.id = p_id and s.mei_id = p_mei;
  if not found then
    raise exception 'regra: serviço não encontrado';
  end if;

  if r.whatsapp is null then v_falta := v_falta || 'cliente.whatsapp'::text; end if;
  if r.endereco is null and r.local is null then v_falta := v_falta || 'cliente.endereco'::text; end if;
  if r.valor is null then v_falta := v_falta || 'servico.valor'::text; end if;
  if r.data_prevista is null then v_falta := v_falta || 'servico.data_prevista'::text; end if;
  if r.forma_pagamento is null then v_falta := v_falta || 'servico.forma_pagamento'::text; end if;
  return v_falta;
end;
$$;

-- Mudança manual de status. Permitidas:
--   aguardando_resposta → confirmado, orcado → confirmado,
--   confirmado | agendado → executado, qualquer estado não pago → cancelado.
-- Pedir o status em que o serviço já está não muda nada e devolve o atual.
create or replace function public.servico_mudar_status(p_mei uuid, p_id uuid, p_para text)
returns public.servicos
language plpgsql
set search_path = ''
as $$
declare
  v_atual   public.servicos := public.servico_do_mei(p_mei, p_id);
  v_para    text := lower(btrim(coalesce(p_para, '')));
  v_servico public.servicos;
begin
  if v_para not in ('rascunho', 'orcado', 'aguardando_resposta', 'confirmado', 'agendado', 'executado', 'pago', 'cancelado') then
    raise exception 'regra: status inválido: %', p_para;
  end if;

  if v_para = v_atual.status then
    return v_atual;
  end if;

  if v_para = 'pago' then
    raise exception 'regra: para marcar como pago, registre o pagamento do serviço';
  elsif v_para = 'agendado' then
    raise exception 'regra: para agendar, informe a data e a hora do serviço';
  elsif v_atual.status = 'pago' then
    raise exception 'regra: este serviço já foi pago e não pode mais mudar de status';
  elsif v_atual.status = 'cancelado' then
    raise exception 'regra: este serviço foi cancelado e não pode mais mudar de status';
  elsif not (
    v_para = 'cancelado'
    or (v_para = 'confirmado' and v_atual.status in ('orcado', 'aguardando_resposta'))
    or (v_para = 'executado' and v_atual.status in ('confirmado', 'agendado'))
  ) then
    raise exception 'regra: não é possível passar o serviço de % para %', v_atual.status, v_para;
  end if;

  update public.servicos s
  set status = v_para, atualizado_em = now()
  where s.id = v_atual.id
  returning s.* into v_servico;

  return v_servico;
end;
$$;

-- Agenda (ou reagenda) o serviço. Exige `confirmado` ou `agendado`; leva a
-- `agendado`. Sem local, usa o local do serviço. A data prevista passa a ser o
-- dia do agendamento em America/Sao_Paulo.
create or replace function public.servico_agendar(p_mei uuid, p_id uuid, p_inicio timestamptz, p_local text)
returns public.agendamentos
language plpgsql
set search_path = ''
as $$
declare
  v_atual  public.servicos := public.servico_do_mei(p_mei, p_id);
  v_local  text := coalesce(nullif(btrim(p_local), ''), v_atual.local);
  v_agenda public.agendamentos;
begin
  if v_atual.status not in ('confirmado', 'agendado') then
    raise exception 'regra: o serviço ainda não foi confirmado pelo cliente';
  end if;
  if p_inicio is null then
    raise exception 'regra: informe a data e a hora do serviço';
  end if;

  insert into public.agendamentos as a (mei_id, servico_id, inicio, local)
  values (p_mei, v_atual.id, p_inicio, v_local)
  on conflict (servico_id) do update
    set inicio = excluded.inicio, local = excluded.local, atualizado_em = now()
  returning a.* into v_agenda;

  update public.servicos s
  set status        = 'agendado',
      data_prevista = (p_inicio at time zone 'America/Sao_Paulo')::date,
      local         = coalesce(s.local, v_local),
      atualizado_em = now()
  where s.id = v_atual.id;

  return v_agenda;
end;
$$;

-- Lança um recebimento. Quando a soma dos pagamentos alcança o valor do
-- serviço, ele vai para `pago`. Devolve {pago_total, restante, status}.
create or replace function public.pagamento_registrar(p_mei uuid, p_servico uuid, p_valor numeric, p_forma text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_atual  public.servicos := public.servico_do_mei(p_mei, p_servico);
  v_valor  numeric := public.servico_valor_valido(p_valor::text);
  v_forma  text := public.forma_pagamento_valida(p_forma);
  v_total  numeric;
  v_status text := v_atual.status;
begin
  if v_valor is null then
    raise exception 'regra: o valor precisa ser maior que zero';
  end if;
  if v_atual.status = 'pago' then
    raise exception 'regra: este serviço já está pago';
  elsif v_atual.status = 'cancelado' then
    raise exception 'regra: este serviço foi cancelado';
  elsif v_atual.valor is null then
    raise exception 'regra: defina o valor do serviço antes de registrar o pagamento';
  end if;

  insert into public.pagamentos (mei_id, servico_id, valor, forma)
  values (p_mei, v_atual.id, v_valor, coalesce(v_forma, v_atual.forma_pagamento));

  select coalesce(sum(p.valor), 0) into v_total
  from public.pagamentos p
  where p.servico_id = v_atual.id;

  if v_total >= v_atual.valor then
    v_status := 'pago';
    update public.servicos s
    set status = 'pago', atualizado_em = now()
    where s.id = v_atual.id;
  end if;

  return jsonb_build_object(
    'pago_total', v_total,
    'restante', greatest(v_atual.valor - v_total, 0),
    'status', v_status
  );
end;
$$;

-- Serviços do MEI com o nome do cliente, mais recentes primeiro. Com
-- `p_status`, só os desse status.
create or replace function public.servico_listar(p_mei uuid, p_status text default null)
returns table (
  id               uuid,
  mei_id           uuid,
  cliente_id       uuid,
  numero           int,
  descricao        text,
  valor            numeric,
  data_prevista    date,
  local            text,
  forma_pagamento  text,
  status           text,
  criado_em        timestamptz,
  atualizado_em    timestamptz,
  cliente_nome     text,
  cliente_whatsapp text
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.mei_id, s.cliente_id, s.numero, s.descricao, s.valor, s.data_prevista, s.local,
         s.forma_pagamento, s.status, s.criado_em, s.atualizado_em, c.nome, c.whatsapp
  from public.servicos s
  join public.clientes c on c.id = s.cliente_id
  where s.mei_id = p_mei
    and (nullif(btrim(p_status), '') is null or s.status = lower(btrim(p_status)))
  order by s.numero desc;
$$;

-- Agendamentos do MEI cujo dia (em America/Sao_Paulo) cai entre p_de e p_ate,
-- inclusive, em ordem de horário. Serviço cancelado sai da agenda.
create or replace function public.agenda_listar(p_mei uuid, p_de date, p_ate date)
returns table (
  id               uuid,
  servico_id       uuid,
  inicio           timestamptz,
  local            text,
  numero           int,
  descricao        text,
  status           text,
  cliente_id       uuid,
  cliente_nome     text,
  cliente_whatsapp text
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.servico_id, a.inicio, a.local, s.numero, s.descricao, s.status, c.id, c.nome, c.whatsapp
  from public.agendamentos a
  join public.servicos s on s.id = a.servico_id
  join public.clientes c on c.id = s.cliente_id
  where a.mei_id = p_mei
    and s.status <> 'cancelado'
    and (a.inicio at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  order by a.inicio, s.numero;
$$;

revoke execute on function public.uuid_ou_nulo(text) from public, anon, authenticated;
revoke execute on function public.servico_valor_valido(text) from public, anon, authenticated;
revoke execute on function public.forma_pagamento_valida(text) from public, anon, authenticated;
revoke execute on function public.data_prevista_valida(text) from public, anon, authenticated;
revoke execute on function public.servico_do_mei(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.servico_registrar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.servico_atualizar(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.servico_faltantes(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.servico_mudar_status(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.servico_agendar(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.pagamento_registrar(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.servico_listar(uuid, text) from public, anon, authenticated;
revoke execute on function public.agenda_listar(uuid, date, date) from public, anon, authenticated;
grant execute on function public.uuid_ou_nulo(text) to service_role;
grant execute on function public.servico_valor_valido(text) to service_role;
grant execute on function public.forma_pagamento_valida(text) to service_role;
grant execute on function public.data_prevista_valida(text) to service_role;
grant execute on function public.servico_do_mei(uuid, uuid) to service_role;
grant execute on function public.servico_registrar(uuid, jsonb) to service_role;
grant execute on function public.servico_atualizar(uuid, uuid, jsonb) to service_role;
grant execute on function public.servico_faltantes(uuid, uuid) to service_role;
grant execute on function public.servico_mudar_status(uuid, uuid, text) to service_role;
grant execute on function public.servico_agendar(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.pagamento_registrar(uuid, uuid, numeric, text) to service_role;
grant execute on function public.servico_listar(uuid, text) to service_role;
grant execute on function public.agenda_listar(uuid, date, date) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
