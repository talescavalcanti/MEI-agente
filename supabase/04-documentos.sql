-- ============================================================================
-- MEIagente — orçamento, contrato, mensagem e aprovação
-- Rode no SQL Editor do Supabase, depois do 03-servicos.sql. Idempotente.
--
-- Mesma postura dos anteriores: RLS ligado e SEM políticas; toda função recebe
-- `p_mei` e filtra por ele (id de outro MEI = id inexistente); violação de
-- regra é `raise exception 'regra: <frase para o usuário>'`.
--
-- Orçamento, contrato e mensagem nascem `rascunho`. O modelo só cria e refaz
-- rascunhos; aprovar, descartar e editar são ação do usuário (item_decidir,
-- item_editar), e só valem em `rascunho`. Decisão repetida não muda nada.
-- Nada é enviado daqui: `mensagem_marcar_enviada` só registra que o usuário
-- enviou por conta própria (copiar / abrir o WhatsApp).
--
-- Efeitos no serviço (os únicos caminhos para estes status, ver 03-servicos.sql):
--   orcamento_gerar          rascunho → orcado
--   mensagem_marcar_enviada  orcado → aguardando_resposta (objetivo envio_orcamento)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- Orçamento do serviço. Um por serviço: gerar de novo refaz o rascunho.
create table if not exists public.orcamentos (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  servico_id    uuid not null unique references public.servicos (id) on delete cascade,
  -- Mesmo número do serviço, para o usuário se referir a ele.
  numero        int not null,
  valor         numeric(12, 2) not null check (valor > 0),
  -- [{descricao, valor}], sempre somando `valor`.
  itens         jsonb not null,
  validade_dias int not null default 7 check (validade_dias between 1 and 365),
  status        text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'descartado')),
  aprovado_em   timestamptz,
  aprovado_por  uuid references public.users (id) on delete set null,
  enviado_em    timestamptz,
  respondido_em timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists orcamentos_mei_status_idx on public.orcamentos (mei_id, status);

alter table public.orcamentos enable row level security;

-- Minuta de contrato do serviço. Uma por serviço: salvar de novo refaz o rascunho.
create table if not exists public.contratos (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  servico_id    uuid not null unique references public.servicos (id) on delete cascade,
  minuta        text not null,
  status        text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'descartado')),
  aprovado_em   timestamptz,
  aprovado_por  uuid references public.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists contratos_mei_status_idx on public.contratos (mei_id, status);

alter table public.contratos enable row level security;

-- Mensagens rascunhadas pelo agente (WhatsApp ou post de Instagram).
-- `tarefa_id` aponta para public.tarefas (05-pendencias.sql); a chave
-- estrangeira fica para aquele arquivo, que cria a tabela.
create table if not exists public.mensagens (
  id            uuid primary key default gen_random_uuid(),
  mei_id        uuid not null references public.meis (id) on delete cascade,
  cliente_id    uuid references public.clientes (id) on delete cascade,
  servico_id    uuid references public.servicos (id) on delete cascade,
  canal         text not null check (canal in ('whatsapp', 'instagram')),
  objetivo      text not null check (objetivo in ('confirmacao', 'envio_orcamento', 'lembrete', 'cobranca', 'post', 'outro')),
  conteudo      text not null check (char_length(conteudo) between 1 and 2000),
  status        text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'descartado', 'enviado')),
  aprovado_em   timestamptz,
  aprovado_por  uuid references public.users (id) on delete set null,
  enviado_em    timestamptz,
  tarefa_id     uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists mensagens_mei_status_idx on public.mensagens (mei_id, status);
create index if not exists mensagens_servico_idx on public.mensagens (servico_id);

alter table public.mensagens enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Itens do orçamento validados e normalizados: [{descricao, valor}].
-- Sem itens (null), um item só, com `p_descricao` e `p_valor`. A soma precisa
-- dar exatamente `p_valor`.
create or replace function public.orcamento_itens_validos(p_itens jsonb, p_valor numeric, p_descricao text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_descricao text;
  v_valor     numeric;
  v_soma      numeric := 0;
  v_saida     jsonb := '[]'::jsonb;
begin
  if p_itens is null or jsonb_typeof(p_itens) = 'null' then
    return jsonb_build_array(jsonb_build_object('descricao', p_descricao, 'valor', p_valor));
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'regra: informe ao menos um item do orçamento';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'regra: o orçamento pode ter no máximo 50 itens';
  end if;

  for v_item in select e from jsonb_array_elements(p_itens) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'regra: cada item do orçamento precisa de descrição e valor';
    end if;
    v_descricao := nullif(btrim(v_item->>'descricao'), '');
    if v_descricao is null then
      raise exception 'regra: cada item do orçamento precisa de uma descrição';
    end if;
    v_valor := public.servico_valor_valido(v_item->>'valor');
    if v_valor is null then
      raise exception 'regra: o item "%" está sem valor', v_descricao;
    end if;
    v_soma := v_soma + v_valor;
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('descricao', v_descricao, 'valor', v_valor));
  end loop;

  if v_soma <> p_valor then
    raise exception 'regra: os itens somam R$ %, mas o valor do serviço é R$ %',
      to_char(v_soma, 'FM999999999990.00'), to_char(p_valor, 'FM999999999990.00');
  end if;
  return v_saida;
end;
$$;

-- Validade do orçamento em dias (1 a 365). Ausente = 7.
create or replace function public.orcamento_validade_valida(p_texto text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v int;
begin
  if nullif(btrim(p_texto), '') is null then
    return 7;
  end if;
  begin
    v := btrim(p_texto)::int;
  exception when others then
    raise exception 'regra: a validade do orçamento precisa ser um número de dias';
  end;
  if v < 1 or v > 365 then
    raise exception 'regra: a validade do orçamento precisa ser entre 1 e 365 dias';
  end if;
  return v;
end;
$$;

-- Conteúdo de mensagem: sem espaços nas pontas, de 1 a 2000 caracteres.
create or replace function public.mensagem_conteudo_valido(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_texto, ''), e' \t\r\n');
begin
  if v = '' then
    raise exception 'regra: a mensagem está vazia';
  end if;
  if char_length(v) > 2000 then
    raise exception 'regra: a mensagem passou de 2000 caracteres';
  end if;
  return v;
end;
$$;

-- Minuta de contrato: não pode ser vazia.
create or replace function public.contrato_minuta_valida(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_texto, ''), e' \t\r\n');
begin
  if v = '' then
    raise exception 'regra: a minuta do contrato está vazia';
  end if;
  if char_length(v) > 50000 then
    raise exception 'regra: a minuta do contrato está longa demais';
  end if;
  return v;
end;
$$;

-- Tabela do tipo de item (orcamento | contrato | mensagem). Outro = regra.
create or replace function public.item_tabela(p_tipo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  case lower(btrim(coalesce(p_tipo, '')))
    when 'orcamento' then return 'orcamentos';
    when 'contrato' then return 'contratos';
    when 'mensagem' then return 'mensagens';
    else raise exception 'regra: tipo de item inválido (use orcamento, contrato ou mensagem)';
  end case;
end;
$$;

-- Status atual do item do MEI, com a linha travada. Não achou = regra.
create or replace function public.item_status_travado(p_mei uuid, p_tipo text, p_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  execute format('select t.status from public.%I t where t.id = $1 and t.mei_id = $2 for update', public.item_tabela(p_tipo))
  into v_status
  using p_id, p_mei;
  if v_status is null then
    raise exception 'regra: item não encontrado';
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções de domínio
-- ---------------------------------------------------------------------------

-- Gera (ou refaz) o orçamento do serviço. Exige valor no serviço. Sem itens,
-- um item com a descrição e o valor do serviço; com itens, a soma precisa dar
-- o valor. Refaz se ainda for rascunho (ou se foi descartado); recusa se já
-- aprovado. Serviço em `rascunho` passa a `orcado`; outros estados não mudam.
create or replace function public.orcamento_gerar(p_mei uuid, p_servico uuid, p_itens jsonb default null, p_validade int default 7)
returns public.orcamentos
language plpgsql
set search_path = ''
as $$
declare
  v_servico  public.servicos := public.servico_do_mei(p_mei, p_servico);
  v_itens    jsonb;
  v_validade int;
  v_status   text;
  v_orc      public.orcamentos;
begin
  if v_servico.status = 'cancelado' then
    raise exception 'regra: este serviço foi cancelado';
  end if;
  if v_servico.valor is null then
    raise exception 'regra: defina o valor do serviço antes do orçamento';
  end if;
  v_itens := public.orcamento_itens_validos(p_itens, v_servico.valor, v_servico.descricao);
  v_validade := public.orcamento_validade_valida(coalesce(p_validade, 7)::text);

  select o.status into v_status
  from public.orcamentos o
  where o.servico_id = v_servico.id
  for update;
  if v_status = 'aprovado' then
    raise exception 'regra: o orçamento deste serviço já foi aprovado e não pode ser refeito';
  end if;

  insert into public.orcamentos as o (mei_id, servico_id, numero, valor, itens, validade_dias)
  values (p_mei, v_servico.id, v_servico.numero, v_servico.valor, v_itens, v_validade)
  on conflict (servico_id) do update
    set numero        = excluded.numero,
        valor         = excluded.valor,
        itens         = excluded.itens,
        validade_dias = excluded.validade_dias,
        status        = 'rascunho',
        aprovado_em   = null,
        aprovado_por  = null,
        enviado_em    = null,
        respondido_em = null,
        atualizado_em = now()
  returning o.* into v_orc;

  if v_servico.status = 'rascunho' then
    update public.servicos s
    set status = 'orcado', atualizado_em = now()
    where s.id = v_servico.id;
  end if;

  return v_orc;
end;
$$;

-- Salva (ou refaz) a minuta de contrato do serviço. Mesma regra do orçamento:
-- refaz rascunho ou descartado, recusa aprovado.
create or replace function public.contrato_salvar(p_mei uuid, p_servico uuid, p_minuta text)
returns public.contratos
language plpgsql
set search_path = ''
as $$
declare
  v_servico public.servicos := public.servico_do_mei(p_mei, p_servico);
  v_minuta  text := public.contrato_minuta_valida(p_minuta);
  v_status  text;
  v_ctr     public.contratos;
begin
  if v_servico.status = 'cancelado' then
    raise exception 'regra: este serviço foi cancelado';
  end if;

  select c.status into v_status
  from public.contratos c
  where c.servico_id = v_servico.id
  for update;
  if v_status = 'aprovado' then
    raise exception 'regra: o contrato deste serviço já foi aprovado e não pode ser refeito';
  end if;

  insert into public.contratos as c (mei_id, servico_id, minuta)
  values (p_mei, v_servico.id, v_minuta)
  on conflict (servico_id) do update
    set minuta        = excluded.minuta,
        status        = 'rascunho',
        aprovado_em   = null,
        aprovado_por  = null,
        atualizado_em = now()
  returning c.* into v_ctr;

  return v_ctr;
end;
$$;

-- Rascunha uma mensagem. p_dados: {canal, objetivo, conteudo, cliente_id?,
-- servico_id?, tarefa_id?}. Com serviço e sem cliente, o cliente é o do
-- serviço; cliente diferente do serviço = regra.
create or replace function public.mensagem_rascunhar(p_mei uuid, p_dados jsonb)
returns public.mensagens
language plpgsql
set search_path = ''
as $$
declare
  v_canal    text := lower(nullif(btrim(p_dados->>'canal'), ''));
  v_objetivo text := lower(nullif(btrim(p_dados->>'objetivo'), ''));
  v_conteudo text := public.mensagem_conteudo_valido(p_dados->>'conteudo');
  v_cliente  uuid;
  v_servico  public.servicos;
  v_tarefa   uuid;
  v_msg      public.mensagens;
begin
  if v_canal is null or v_canal not in ('whatsapp', 'instagram') then
    raise exception 'regra: canal inválido (use whatsapp ou instagram)';
  end if;
  if v_objetivo is null or v_objetivo not in ('confirmacao', 'envio_orcamento', 'lembrete', 'cobranca', 'post', 'outro') then
    raise exception 'regra: objetivo inválido (use confirmacao, envio_orcamento, lembrete, cobranca, post ou outro)';
  end if;

  if nullif(btrim(p_dados->>'cliente_id'), '') is not null then
    select c.id into v_cliente
    from public.clientes c
    where c.id = public.uuid_ou_nulo(p_dados->>'cliente_id') and c.mei_id = p_mei;
    if v_cliente is null then
      raise exception 'regra: cliente não encontrado';
    end if;
  end if;

  if nullif(btrim(p_dados->>'servico_id'), '') is not null then
    select s.* into v_servico
    from public.servicos s
    where s.id = public.uuid_ou_nulo(p_dados->>'servico_id') and s.mei_id = p_mei;
    if v_servico.id is null then
      raise exception 'regra: serviço não encontrado';
    end if;
    if v_cliente is null then
      v_cliente := v_servico.cliente_id;
    elsif v_cliente <> v_servico.cliente_id then
      raise exception 'regra: este serviço é de outro cliente';
    end if;
  end if;

  if v_objetivo = 'envio_orcamento' and v_servico.id is null then
    raise exception 'regra: informe o serviço do orçamento';
  end if;

  if nullif(btrim(p_dados->>'tarefa_id'), '') is not null then
    v_tarefa := public.uuid_ou_nulo(p_dados->>'tarefa_id');
    if v_tarefa is null then
      raise exception 'regra: tarefa não encontrada';
    end if;
  end if;

  insert into public.mensagens (mei_id, cliente_id, servico_id, canal, objetivo, conteudo, tarefa_id)
  values (p_mei, v_cliente, v_servico.id, v_canal, v_objetivo, v_conteudo, v_tarefa)
  returning * into v_msg;

  return v_msg;
end;
$$;

-- Decisão do usuário (botão do cartão): aprovar ou descartar um rascunho.
-- Item fora de `rascunho` não muda e volta com o status atual (clique duplo,
-- aprovar depois de descartar). Devolve {tipo, id, status, mudou}.
-- Decisão que muda o item fica em agente_acoes (tipo `decisao`, 06-agente.sql).
create or replace function public.item_decidir(p_mei uuid, p_tipo text, p_id uuid, p_decisao text, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tipo    text := lower(btrim(coalesce(p_tipo, '')));
  v_tabela  text := public.item_tabela(p_tipo);
  v_decisao text := lower(btrim(coalesce(p_decisao, '')));
  v_status  text;
  v_novo    text;
  v_saida   jsonb;
begin
  if v_decisao not in ('aprovar', 'descartar') then
    raise exception 'regra: decisão inválida (use aprovar ou descartar)';
  end if;

  v_status := public.item_status_travado(p_mei, v_tipo, p_id);
  if v_status <> 'rascunho' then
    return jsonb_build_object('tipo', v_tipo, 'id', p_id, 'status', v_status, 'mudou', false);
  end if;

  v_novo := case v_decisao when 'aprovar' then 'aprovado' else 'descartado' end;
  execute format(
    'update public.%I t
        set status = $1,
            aprovado_em = case when $1 = ''aprovado'' then now() end,
            aprovado_por = case when $1 = ''aprovado'' then $2 end,
            atualizado_em = now()
      where t.id = $3 and t.mei_id = $4',
    v_tabela
  ) using v_novo, p_user, p_id, p_mei;

  v_saida := jsonb_build_object('tipo', v_tipo, 'id', p_id, 'status', v_novo, 'mudou', true);

  -- Trilha de auditoria (README §9): só decisão que mudou o item. A tabela
  -- nasce no 06-agente.sql; até lá, não há onde gravar.
  if to_regclass('public.agente_acoes') is not null then
    execute 'insert into public.agente_acoes (mei_id, tipo, nome, entrada, saida, user_id)
             values ($1, ''decisao'', $2, $3, $4, $5)'
    using p_mei, v_decisao,
          jsonb_build_object('tipo', v_tipo, 'id', p_id, 'decisao', v_decisao),
          v_saida, p_user;
  end if;

  return v_saida;
end;
$$;

-- Edição do usuário num rascunho. Devolve a linha editada.
--   mensagem:  {conteudo}
--   contrato:  {minuta}
--   orcamento: {itens?, validade_dias?} (campo ausente mantém; a soma dos itens
--              precisa dar o valor do orçamento)
create or replace function public.item_editar(p_mei uuid, p_tipo text, p_id uuid, p_dados jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tipo   text := lower(btrim(coalesce(p_tipo, '')));
  v_status text := public.item_status_travado(p_mei, p_tipo, p_id);
  v_orc    public.orcamentos;
  v_saida  jsonb;
begin
  if v_status = 'aprovado' then
    raise exception 'regra: este item já foi aprovado';
  elsif v_status = 'descartado' then
    raise exception 'regra: este item foi descartado';
  elsif v_status = 'enviado' then
    raise exception 'regra: esta mensagem já foi enviada';
  end if;
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if v_tipo = 'mensagem' then
    update public.mensagens m
    set conteudo = public.mensagem_conteudo_valido(p_dados->>'conteudo'), atualizado_em = now()
    where m.id = p_id
    returning to_jsonb(m.*) into v_saida;
  elsif v_tipo = 'contrato' then
    update public.contratos c
    set minuta = public.contrato_minuta_valida(p_dados->>'minuta'), atualizado_em = now()
    where c.id = p_id
    returning to_jsonb(c.*) into v_saida;
  else
    select o.* into v_orc from public.orcamentos o where o.id = p_id;
    update public.orcamentos o
    set itens = case
                  when jsonb_typeof(p_dados->'itens') is null or jsonb_typeof(p_dados->'itens') = 'null' then o.itens
                  else public.orcamento_itens_validos(p_dados->'itens', v_orc.valor, null)
                end,
        validade_dias = case
                          when nullif(btrim(p_dados->>'validade_dias'), '') is null then o.validade_dias
                          else public.orcamento_validade_valida(p_dados->>'validade_dias')
                        end,
        atualizado_em = now()
    where o.id = p_id
    returning to_jsonb(o.*) into v_saida;
  end if;

  return v_saida;
end;
$$;

-- O usuário avisa que enviou a mensagem (por conta própria). Exige `aprovado`;
-- já enviada volta como está. Envio de orçamento marca `orcamentos.enviado_em`
-- e leva o serviço de `orcado` a `aguardando_resposta`. Com tarefa, ela fica
-- `feita`.
create or replace function public.mensagem_marcar_enviada(p_mei uuid, p_id uuid)
returns public.mensagens
language plpgsql
set search_path = ''
as $$
declare
  v_msg public.mensagens;
begin
  select m.* into v_msg
  from public.mensagens m
  where m.id = p_id and m.mei_id = p_mei
  for update;
  if v_msg.id is null then
    raise exception 'regra: mensagem não encontrada';
  end if;
  if v_msg.status = 'enviado' then
    return v_msg;
  elsif v_msg.status = 'descartado' then
    raise exception 'regra: esta mensagem foi descartada';
  elsif v_msg.status <> 'aprovado' then
    raise exception 'regra: aprove a mensagem antes de marcar como enviada';
  end if;

  update public.mensagens m
  set status = 'enviado', enviado_em = now(), atualizado_em = now()
  where m.id = v_msg.id
  returning m.* into v_msg;

  if v_msg.objetivo = 'envio_orcamento' and v_msg.servico_id is not null then
    update public.orcamentos o
    set enviado_em = coalesce(o.enviado_em, now()), atualizado_em = now()
    where o.servico_id = v_msg.servico_id and o.mei_id = p_mei;

    update public.servicos s
    set status = 'aguardando_resposta', atualizado_em = now()
    where s.id = v_msg.servico_id and s.mei_id = p_mei and s.status = 'orcado';
  end if;

  -- public.tarefas nasce no 05-pendencias.sql; até lá, não há tarefa a fechar.
  if v_msg.tarefa_id is not null and to_regclass('public.tarefas') is not null then
    execute 'update public.tarefas t set status = ''feita'' where t.id = $1 and t.mei_id = $2 and t.status = ''aberta'''
    using v_msg.tarefa_id, p_mei;
  end if;

  return v_msg;
end;
$$;

-- Item com os dados para o cartão e a impressão:
-- {item, mei, cliente, servico, orcamento}, os quatro últimos no formato
-- DadosDocumento (src/lib/documentos/tipos.ts). Tudo vem do banco.
-- `cliente`/`servico` são null em mensagem sem cliente/serviço; `orcamento` é
-- null se o serviço não tiver orçamento (ou se ele foi descartado e o item
-- não é ele).
create or replace function public.item_ver(p_mei uuid, p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo      text := lower(btrim(coalesce(p_tipo, '')));
  v_item      jsonb;
  v_servico   uuid;
  v_cliente   uuid;
  v_mei       jsonb;
  v_jcliente  jsonb;
  v_jservico  jsonb;
  v_jorc      jsonb;
begin
  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.mei_id = $2', public.item_tabela(p_tipo))
  into v_item
  using p_id, p_mei;
  if v_item is null then
    raise exception 'regra: item não encontrado';
  end if;

  v_servico := (v_item->>'servico_id')::uuid;
  v_cliente := (v_item->>'cliente_id')::uuid;

  select jsonb_build_object(
           'nome', m.nome, 'atividade', m.atividade, 'cidade', m.cidade,
           'telefone', m.telefone, 'chave_pix', m.chave_pix)
  into v_mei
  from public.meis m
  where m.id = p_mei;

  if v_servico is not null then
    select jsonb_build_object(
             'numero', s.numero, 'descricao', s.descricao, 'valor', s.valor,
             'data_prevista', s.data_prevista, 'local', s.local,
             'forma_pagamento', s.forma_pagamento),
           coalesce(v_cliente, s.cliente_id)
    into v_jservico, v_cliente
    from public.servicos s
    where s.id = v_servico and s.mei_id = p_mei;

    select jsonb_build_object(
             'numero', o.numero, 'valor', o.valor, 'itens', o.itens,
             'validade_dias', o.validade_dias)
    into v_jorc
    from public.orcamentos o
    where o.servico_id = v_servico and o.mei_id = p_mei
      and (o.status <> 'descartado' or (v_tipo = 'orcamento' and o.id = p_id));
  end if;

  if v_cliente is not null then
    select jsonb_build_object('nome', c.nome, 'whatsapp', c.whatsapp, 'endereco', c.endereco)
    into v_jcliente
    from public.clientes c
    where c.id = v_cliente and c.mei_id = p_mei;
  end if;

  return jsonb_build_object(
    'item', v_item,
    'mei', v_mei,
    'cliente', v_jcliente,
    'servico', v_jservico,
    'orcamento', v_jorc
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.orcamento_itens_validos(jsonb, numeric, text) from public, anon, authenticated;
revoke execute on function public.orcamento_validade_valida(text) from public, anon, authenticated;
revoke execute on function public.mensagem_conteudo_valido(text) from public, anon, authenticated;
revoke execute on function public.contrato_minuta_valida(text) from public, anon, authenticated;
revoke execute on function public.item_tabela(text) from public, anon, authenticated;
revoke execute on function public.item_status_travado(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.orcamento_gerar(uuid, uuid, jsonb, int) from public, anon, authenticated;
revoke execute on function public.contrato_salvar(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.mensagem_rascunhar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.item_decidir(uuid, text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.item_editar(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.mensagem_marcar_enviada(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.item_ver(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.orcamento_itens_validos(jsonb, numeric, text) to service_role;
grant execute on function public.orcamento_validade_valida(text) to service_role;
grant execute on function public.mensagem_conteudo_valido(text) to service_role;
grant execute on function public.contrato_minuta_valida(text) to service_role;
grant execute on function public.item_tabela(text) to service_role;
grant execute on function public.item_status_travado(uuid, text, uuid) to service_role;
grant execute on function public.orcamento_gerar(uuid, uuid, jsonb, int) to service_role;
grant execute on function public.contrato_salvar(uuid, uuid, text) to service_role;
grant execute on function public.mensagem_rascunhar(uuid, jsonb) to service_role;
grant execute on function public.item_decidir(uuid, text, uuid, text, uuid) to service_role;
grant execute on function public.item_editar(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.mensagem_marcar_enviada(uuid, uuid) to service_role;
grant execute on function public.item_ver(uuid, text, uuid) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
