-- MEIagente — canais da Meta (Instagram e WhatsApp): contas ligadas e mensagens recebidas
--
-- O webhook da Meta (`/api/meta/webhook`) não sabe de qual MEI é a mensagem:
-- ele só traz o id da conta que recebeu (no Instagram, o id da conta
-- profissional; no WhatsApp, o `phone_number_id`). `canais_conectados` é a
-- ponte conta → MEI, e é ela que isola um MEI do outro aqui.
--
-- Por isso `mensagem_recebida_registrar` é a exceção à regra "p_mei primeiro":
-- recebe o canal e acha o MEI pela conta. Conta sem MEI é ignorada (null).
--
-- Nada é respondido daqui: este arquivo só recebe e guarda.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.canais_conectados (
  id        uuid primary key default gen_random_uuid(),
  mei_id    uuid not null references public.meis (id) on delete cascade,
  canal     text not null check (canal in ('whatsapp', 'instagram')),
  conta_id  text not null check (conta_id <> ''),
  criado_em timestamptz not null default now(),
  unique (canal, conta_id)
);

create index if not exists canais_conectados_mei_idx on public.canais_conectados (mei_id);

alter table public.canais_conectados enable row level security;

create table if not exists public.mensagens_recebidas (
  id             uuid primary key default gen_random_uuid(),
  mei_id         uuid not null references public.meis (id) on delete cascade,
  canal          text not null check (canal in ('whatsapp', 'instagram')),
  conta_id       text not null,
  -- Id do remetente no canal: IGSID no Instagram, número (wa_id) no WhatsApp.
  remetente_id   text not null,
  remetente_nome text,
  -- Id da mensagem na Meta (mid / wamid). A Meta reenvia o mesmo evento
  -- quando não recebe 200 a tempo; o unique segura a duplicata.
  externo_id     text not null,
  -- Null quando a mensagem é só anexo (foto, áudio, figurinha).
  conteudo       text check (conteudo is null or char_length(conteudo) <= 2000),
  tipo           text not null default 'texto' check (tipo in ('texto', 'anexo', 'outro')),
  recebida_em    timestamptz not null,
  criado_em      timestamptz not null default now(),
  unique (canal, externo_id)
);

create index if not exists mensagens_recebidas_mei_idx on public.mensagens_recebidas (mei_id, recebida_em desc);

alter table public.mensagens_recebidas enable row level security;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Liga uma conta da Meta ao MEI. Repetir com a mesma conta não muda nada.
-- Conta já ligada a outro MEI é regra (nunca troca de dono em silêncio).
create or replace function public.canal_conectar(p_mei uuid, p_canal text, p_conta text)
returns public.canais_conectados
language plpgsql
set search_path = public
as $$
declare
  v_conta text := btrim(coalesce(p_conta, ''));
  v_canal public.canais_conectados;
begin
  if p_canal is null or p_canal not in ('whatsapp', 'instagram') then
    raise exception 'regra: canal inválido (use whatsapp ou instagram)';
  end if;
  if v_conta = '' then
    raise exception 'regra: informe o id da conta';
  end if;
  if not exists (select 1 from public.meis m where m.id = p_mei) then
    raise exception 'regra: negócio não encontrado';
  end if;

  select * into v_canal from public.canais_conectados c
  where c.canal = p_canal and c.conta_id = v_conta;

  if found then
    if v_canal.mei_id <> p_mei then
      raise exception 'regra: esta conta já está ligada a outro negócio';
    end if;
    return v_canal;
  end if;

  insert into public.canais_conectados (mei_id, canal, conta_id)
  values (p_mei, p_canal, v_conta)
  returning * into v_canal;
  return v_canal;
end;
$$;

-- Guarda uma mensagem recebida pelo webhook. Devolve o id, ou null quando a
-- conta não está ligada a nenhum MEI. Mesma mensagem duas vezes: mesmo id.
-- p_dados: {conta_id, remetente_id, remetente_nome?, externo_id, conteudo?,
--           tipo?, recebida_em?}
create or replace function public.mensagem_recebida_registrar(p_canal text, p_dados jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_mei      uuid;
  v_conta    text := btrim(coalesce(p_dados->>'conta_id', ''));
  v_externo  text := btrim(coalesce(p_dados->>'externo_id', ''));
  v_conteudo text := nullif(btrim(coalesce(p_dados->>'conteudo', '')), '');
  v_id       uuid;
begin
  if v_conta = '' or v_externo = '' or btrim(coalesce(p_dados->>'remetente_id', '')) = '' then
    raise exception 'regra: mensagem recebida sem conta, remetente ou id';
  end if;

  select c.mei_id into v_mei from public.canais_conectados c
  where c.canal = p_canal and c.conta_id = v_conta;
  if v_mei is null then
    return null;
  end if;

  insert into public.mensagens_recebidas
    (mei_id, canal, conta_id, remetente_id, remetente_nome, externo_id, conteudo, tipo, recebida_em)
  values (
    v_mei,
    p_canal,
    v_conta,
    btrim(p_dados->>'remetente_id'),
    nullif(btrim(coalesce(p_dados->>'remetente_nome', '')), ''),
    v_externo,
    left(v_conteudo, 2000),
    coalesce(nullif(p_dados->>'tipo', ''), 'texto'),
    coalesce((p_dados->>'recebida_em')::timestamptz, now())
  )
  on conflict (canal, externo_id) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id from public.mensagens_recebidas r
    where r.canal = p_canal and r.externo_id = v_externo;
  end if;
  return v_id;
end;
$$;

-- Mensagens recebidas do MEI, da mais nova para a mais antiga.
create or replace function public.mensagens_recebidas_listar(p_mei uuid, p_limite int default 50)
returns setof public.mensagens_recebidas
language sql
stable
set search_path = public
as $$
  select r.* from public.mensagens_recebidas r
  where r.mei_id = p_mei
  order by r.recebida_em desc, r.criado_em desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

revoke execute on function public.canal_conectar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mensagem_recebida_registrar(text, jsonb) from public, anon, authenticated;
revoke execute on function public.mensagens_recebidas_listar(uuid, int) from public, anon, authenticated;
grant execute on function public.canal_conectar(uuid, text, text) to service_role;
grant execute on function public.mensagem_recebida_registrar(text, jsonb) to service_role;
grant execute on function public.mensagens_recebidas_listar(uuid, int) to service_role;
