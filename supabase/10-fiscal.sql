-- ============================================================================
-- MEIagente — nota fiscal assistida (NFS-e) e controle de faturamento
-- Rode no SQL Editor do Supabase, depois do 09-meta.sql. Idempotente.
--
-- Mesma postura dos anteriores: RLS ligado e SEM políticas; toda função de
-- domínio recebe `p_mei` e filtra por ele (id de outro MEI = id inexistente);
-- violação de regra é `raise exception 'regra: <frase para o usuário>'`.
--
-- Nada é emitido daqui. O agente PREPARA a nota a partir do banco; o MEI
-- confere, aprova (nota_decidir) e emite no Emissor Nacional; depois registra
-- a emissão (nota_registrar_emissao), que confere a nota emitida contra o
-- rascunho. Valor, tomador, códigos e competência nunca vêm do modelo.
--
-- Este arquivo também altera, de forma idempotente, tabelas de 02, 04 e 05:
--   meis      + cnpj, inscricao_municipal, municipio, codigo_tributacao, nbs,
--               descricao_padrao_nota
--   clientes  + documento (CPF/CNPJ normalizado, CNPJ pode ser alfanumérico),
--               único por MEI
--   tarefas   tipo aceita 'emitir_nota' e 'corrigir_nota'
--   mensagens objetivo aceita 'envio_nota'; + nota_id; trigger de envio de nota
--   e redefine mensagem_rascunhar (04) para aceitar `nota_id`.
--
-- ----------------------------------------------------------------------------
-- STEP 0: conferência em fonte oficial (13/11/2026)
-- ----------------------------------------------------------------------------
-- 3. Limite anual do MEI e excesso. A LC 238, de 21/10/2026, mudou o limite:
--      ano-calendário até 2026: R$ 81.000 (inalterado);
--      2027: R$ 110.000 (art. 2º; no ano de início, R$ 9.166,67 por mês);
--      a partir de 1º/1/2028: R$ 140.000 (art. 18-A, §1º da LC 123, efeitos
--      pelo art. 10, I; no ano de início, R$ 11.666,67 por mês).
--    A regra do excesso não mudou: até 20% acima do limite, segue MEI no ano e
--    desenquadra em 1º/1 do ano seguinte, com DAS complementar sobre o
--    excesso; acima de 20%, desenquadramento retroativo a 1º/1 do ano (ou à
--    abertura, no 1º ano). Valores ficam só em fiscal_parametros(p_ano).
--    PENDÊNCIA: limite proporcional do 1º ano de atividade fica fora (não há
--    data de abertura do CNPJ no banco).
--    https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp238.htm
--    https://www.gov.br/memp/pt-br/prospera-mei/teto-do-mei
--    https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes/desenquadramento/a-partir-de-que-data
--    https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_DESENQUADRAMENTO_SIMEI.pdf
-- 4. Cancelamento/substituição de NFS-e: não há prazo nacional único; cada
--    município define o seu (fontes municipais citam de 2 a 730 dias). Fora do
--    prazo, só por processo administrativo na prefeitura. A substituição não
--    muda tomador, competência nem valor: erro nesses campos exige cancelar e
--    emitir outra. Nada disso é regra do SQL (só texto do cartão, Task 17d).
--    https://fazenda.pbh.gov.br/nfse/FAQ/
--    https://mid.curitiba.pr.gov.br/2025/00461865.pdf
-- 5. Obrigatoriedade (Resolução CGSN 140/2018, art. 106): o MEI é dispensado
--    de nota para consumidor final pessoa física (salvo se o cliente pedir) e
--    obrigado para pessoa jurídica (salvo se o destinatário emitir nota de
--    entrada). Por isso tarefas_gerar_notas só lembra de cliente com CNPJ.
--    http://www.portaldoempreendedor.gov.br/duvidas-frequentes/4-nota-fiscal-inscricao-estadual-e-ou-municipal
--    https://www.gov.br/nfse/pt-br/copy_of_perguntas-frequentes/copy_of_faq-nfs-e
-- 6. IBS/CBS (NTs SE/CGNFS-e 007, 008 e 009/2026, leiautes 1.03 e 1.04): o
--    grupo IBS/CBS não é exigido do MEI em 2026 e os campos que conferimos
--    (número, chave, valor, tomador, competência, cTribNac) não mudam. Nada novo
--    aqui. (Conferido em resumos das NTs, não no texto das NTs.)
--    https://www.gov.br/nfse
-- Formatos (builder da 17b, XSD oficial tiposSimples_v1.01.xsd): cTribNac =
-- 6 dígitos (a planilha oficial grava sem zero à esquerda: lpad 6); cNBS = 9
-- dígitos; CPF 11 dígitos; CNPJ 14 posições (alfanumérico desde julho de
-- 2026, IN RFB 2.229/2024; ver documento_valido).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Alterações em tabelas existentes
-- ---------------------------------------------------------------------------

alter table public.meis
  add column if not exists cnpj                  text,
  add column if not exists inscricao_municipal   text,
  add column if not exists municipio             text,
  add column if not exists codigo_tributacao     text,
  add column if not exists nbs                   text,
  add column if not exists descricao_padrao_nota text;

-- CPF (11) ou CNPJ (14, pode ser alfanumérico), normalizado em maiúsculas
-- por documento_valido. Tamanho 14 = pessoa jurídica.
alter table public.clientes add column if not exists documento text;

create unique index if not exists clientes_mei_documento_idx
  on public.clientes (mei_id, documento)
  where documento is not null;

alter table public.tarefas drop constraint if exists tarefas_tipo_check;
alter table public.tarefas add constraint tarefas_tipo_check
  check (tipo in ('follow_up_orcamento', 'emitir_nota', 'corrigir_nota'));

alter table public.mensagens drop constraint if exists mensagens_objetivo_check;
alter table public.mensagens add constraint mensagens_objetivo_check
  check (objetivo in ('confirmacao', 'envio_orcamento', 'lembrete', 'cobranca', 'post', 'outro', 'envio_nota'));

-- ---------------------------------------------------------------------------
-- Notas fiscais (rascunho preparado pelo agente, conferido e emitido pelo MEI)
-- ---------------------------------------------------------------------------
--   rascunho → aprovado → emitida | divergente
--   rascunho → descartado
--   divergente → emitida (registrada de novo, já corrigida) | cancelada
create table if not exists public.notas_fiscais (
  id                  uuid primary key default gen_random_uuid(),
  mei_id              uuid not null references public.meis (id) on delete cascade,
  servico_id          uuid not null references public.servicos (id) on delete cascade,
  cliente_id          uuid not null references public.clientes (id) on delete cascade,
  -- Sequencial por MEI, para o usuário se referir à nota (não é o nº da NFS-e).
  numero_seq          int not null,
  valor               numeric(12, 2) not null check (valor > 0),
  parcial             boolean not null default false,
  competencia         date not null,
  descricao           text not null,
  codigo_tributacao   text not null,
  nbs                 text,
  municipio_prestacao text,
  tomador_documento   text not null,
  -- [{codigo, texto}]: precisam de confirmação para aprovar.
  avisos              jsonb not null default '[]'::jsonb,
  avisos_confirmados  boolean not null default false,
  status              text not null default 'rascunho' check (status in (
    'rascunho', 'aprovado', 'emitida', 'divergente', 'descartado', 'cancelada'
  )),
  aprovado_em         timestamptz,
  aprovado_por        uuid references public.users (id) on delete set null,
  emitida_em          timestamptz,
  numero_nfse         text,
  chave_acesso        text,
  -- {campo: {esperado, emitido}} da última conferência ({} = bateu).
  conferencia         jsonb,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (mei_id, numero_seq)
);

-- Uma nota não parcial ativa por serviço (clique duplo, modelo repetindo).
create unique index if not exists notas_fiscais_ativa_unica
  on public.notas_fiscais (servico_id)
  where not parcial and status not in ('descartado', 'cancelada');
create index if not exists notas_fiscais_mei_status_idx on public.notas_fiscais (mei_id, status);
create index if not exists notas_fiscais_servico_idx on public.notas_fiscais (servico_id);
create index if not exists notas_fiscais_cliente_idx on public.notas_fiscais (cliente_id);

alter table public.notas_fiscais enable row level security;

alter table public.mensagens
  add column if not exists nota_id uuid references public.notas_fiscais (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Parâmetros fiscais do ano (nulo = ano de hoje em São Paulo). Único lugar
-- com os valores do Step 0.
create or replace function public.fiscal_parametros(p_ano int default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ano int := coalesce(p_ano, extract(year from public.hoje_sp())::int);
begin
  if v_ano < 2000 or v_ano > 2100 then
    raise exception 'regra: ano inválido';
  end if;
  return jsonb_build_object(
    'ano', v_ano,
    -- LC 238/2026: 81 mil até 2026, 110 mil em 2027, 140 mil a partir de 2028.
    'limite_anual', case when v_ano <= 2026 then 81000 when v_ano = 2027 then 110000 else 140000 end,
    'tolerancia_excesso', 0.20,
    'dias_para_emitir', 5,
    'dias_duplicata', 30
  );
end;
$$;

-- Documento normalizado (maiúsculas, sem pontos, barra, traço e espaços) se
-- for CPF (11 dígitos) ou CNPJ (14 posições) com dígitos verificadores
-- corretos; senão null.
--   CPF: só dígitos; sequência repetida (111.111.111-11) é recusada.
--   CNPJ: 12 posições [0-9A-Z] (raiz 8 + ordem 4) + 2 DVs numéricos. Desde
--   julho de 2026 a Receita emite CNPJ alfanumérico (IN RFB 2.229/2024); o DV
--   usa o valor (código ASCII - 48) de cada caractere, então dígito vale ele
--   mesmo e A=17 ... Z=42, com os pesos e o módulo 11 do CNPJ numérico.
--   Exemplo oficial: 12.ABC.345/01DE-35. Sequência repetida só é recusada no
--   CNPJ só numérico.
--   https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf
-- O mesmo algoritmo está em src/lib/fiscal/documento.ts (Task 17b).
create or replace function public.documento_valido(p_doc text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := upper(regexp_replace(coalesce(p_doc, ''), '[\s./-]', '', 'g'));
  n int[];
  w int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s int;
  r int;
begin
  if not (d ~ '^\d{11}$' or d ~ '^[0-9A-Z]{12}\d{2}$') or d ~ '^(\d)\1*$' then
    return null;
  end if;
  n := array(select ascii(substr(d, i, 1)) - 48 from generate_series(1, length(d)) as i);

  if length(d) = 11 then
    -- CPF: pesos 10..2 e 11..2; resto de (soma * 10) / 11, 10 vira 0.
    for k in 9..10 loop
      s := 0;
      for i in 1..k loop
        s := s + n[i] * (k + 2 - i);
      end loop;
      r := (s * 10) % 11;
      if r = 10 then r := 0; end if;
      if r <> n[k + 1] then return null; end if;
    end loop;
  else
    -- CNPJ: pesos 5..2,9..2 e 6..2,9..2; resto < 2 vira 0, senão 11 - resto.
    for k in 12..13 loop
      s := 0;
      for i in 1..k loop
        s := s + n[i] * w[i + 13 - k];
      end loop;
      r := s % 11;
      r := case when r < 2 then 0 else 11 - r end;
      if r <> n[k + 1] then return null; end if;
    end loop;
  end if;
  return d;
end;
$$;

-- Código de tributação nacional (cTribNac): 6 dígitos. Aceita pontos e o
-- formato sem zero à esquerda da planilha oficial (5 dígitos). Ausente = null.
create or replace function public.fiscal_codigo_tributacao_valido(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_texto, '')), '[.\s-]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^\d{5,6}$' then
    raise exception 'regra: código de tributação nacional inválido (use 6 dígitos, ex.: 14.01.01)';
  end if;
  return lpad(v, 6, '0');
end;
$$;

-- NBS (cNBS): 9 dígitos. Aceita pontos. Ausente = null.
create or replace function public.fiscal_nbs_valido(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_texto, '')), '[.\s-]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^\d{9}$' then
    raise exception 'regra: NBS inválido (use 9 dígitos, ex.: 1.2001.81.00)';
  end if;
  return v;
end;
$$;

-- Cidade de um endereço que termina em "Cidade/UF" ou "Cidade - UF",
-- normalizada (minúsculas, sem acento). Sem UF no fim = null (não dá para saber).
create or replace function public.fiscal_cidade(p_texto text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  m text[] := regexp_match(btrim(coalesce(p_texto, '')), '^(.*)(/|\s-\s)\s*[A-Za-z]{2}$');
  v text;
begin
  if m is null then
    return null;
  end if;
  -- Último trecho depois da vírgula: "Rua 1, 230, Goiânia/GO" → "Goiânia".
  v := btrim(regexp_replace(m[1], '^.*,', ''));
  if v !~ '[[:alpha:]]' then
    return null;
  end if;
  return public.sem_acento(v);
end;
$$;

-- Reais no formato brasileiro: 1234.5 → "1.234,50".
create or replace function public.fiscal_reais(p_valor numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(coalesce(p_valor, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- ---------------------------------------------------------------------------
-- Dados fiscais
-- ---------------------------------------------------------------------------

-- Dados fiscais do MEI. p_dados: {cnpj?, inscricao_municipal?, municipio?,
-- codigo_tributacao?, nbs?, descricao_padrao_nota?}. Campo ausente ou em
-- branco não apaga o que já estava.
create or replace function public.mei_dados_fiscais_salvar(p_mei uuid, p_dados jsonb)
returns public.meis
language plpgsql
set search_path = ''
as $$
declare
  v_cnpj      text;
  v_inscricao text := nullif(btrim(p_dados->>'inscricao_municipal'), '');
  v_municipio text := nullif(btrim(p_dados->>'municipio'), '');
  v_codigo    text := public.fiscal_codigo_tributacao_valido(p_dados->>'codigo_tributacao');
  v_nbs       text := public.fiscal_nbs_valido(p_dados->>'nbs');
  v_descricao text := nullif(btrim(p_dados->>'descricao_padrao_nota'), '');
  v_mei       public.meis;
begin
  if nullif(btrim(p_dados->>'cnpj'), '') is not null then
    v_cnpj := public.documento_valido(p_dados->>'cnpj');
    if v_cnpj is null or length(v_cnpj) <> 14 then
      raise exception 'regra: CNPJ do negócio inválido';
    end if;
  end if;

  update public.meis m
  set cnpj                  = coalesce(v_cnpj, m.cnpj),
      inscricao_municipal   = coalesce(v_inscricao, m.inscricao_municipal),
      municipio             = coalesce(v_municipio, m.municipio),
      codigo_tributacao     = coalesce(v_codigo, m.codigo_tributacao),
      nbs                   = coalesce(v_nbs, m.nbs),
      descricao_padrao_nota = coalesce(v_descricao, m.descricao_padrao_nota)
  where m.id = p_mei
  returning m.* into v_mei;

  if v_mei.id is null then
    raise exception 'regra: negócio não encontrado';
  end if;
  return v_mei;
end;
$$;

-- CPF ou CNPJ do cliente (o tomador da nota).
create or replace function public.cliente_documento_salvar(p_mei uuid, p_cliente uuid, p_documento text)
returns public.clientes
language plpgsql
set search_path = ''
as $$
declare
  v_doc     text := public.documento_valido(p_documento);
  v_cliente public.clientes;
begin
  perform 1 from public.clientes c where c.id = p_cliente and c.mei_id = p_mei for update;
  if not found then
    raise exception 'regra: cliente não encontrado';
  end if;
  if v_doc is null then
    raise exception 'regra: CPF ou CNPJ inválido';
  end if;

  begin
    update public.clientes c
    set documento = v_doc, atualizado_em = now()
    where c.id = p_cliente and c.mei_id = p_mei
    returning c.* into v_cliente;
  exception when unique_violation then
    raise exception 'regra: já existe outro cliente com esse CPF/CNPJ';
  end;
  return v_cliente;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nota fiscal
-- ---------------------------------------------------------------------------

-- Prepara (ou refaz) o rascunho da nota do serviço. Tudo vem do banco.
-- Sem p_valor_parcial: a nota do valor inteiro; já existindo uma ativa, refaz
-- se for rascunho (mesmo id) e recusa se já aprovada/emitida/divergente.
-- Com p_valor_parcial: uma nota parcial nova; a soma das notas ativas do
-- serviço não passa do valor dele.
create or replace function public.nota_preparar(p_mei uuid, p_servico uuid, p_valor_parcial numeric default null)
returns public.notas_fiscais
language plpgsql
set search_path = ''
as $$
declare
  v_servico public.servicos := public.servico_do_mei(p_mei, p_servico);
  v_mei     public.meis;
  v_cliente public.clientes;
  v_parcial boolean := p_valor_parcial is not null;
  v_hoje    date := public.hoje_sp();
  v_valor   numeric;
  v_atual   public.notas_fiscais;
  v_soma    numeric;
  v_pago    numeric;
  v_ultimo  date;
  v_comp    date;
  v_par     jsonb;
  v_limite  numeric;
  v_outros  numeric;
  v_deste   numeric;
  v_projet  numeric;
  v_local   text;
  v_cid_loc text;
  v_cid_mei text;
  v_dup     int;
  v_avisos  jsonb := '[]'::jsonb;
  v_numero  int;
  v_nota    public.notas_fiscais;
begin
  if v_servico.status not in ('executado', 'pago') then
    raise exception 'regra: a nota só pode ser preparada depois do serviço executado';
  end if;

  select m.* into v_mei from public.meis m where m.id = p_mei;
  if v_mei.cnpj is null or v_mei.codigo_tributacao is null then
    raise exception 'regra: complete os dados fiscais em Meu negócio';
  end if;

  select c.* into v_cliente from public.clientes c where c.id = v_servico.cliente_id and c.mei_id = p_mei;
  if v_cliente.documento is null then
    raise exception 'regra: informe o CPF ou CNPJ do cliente';
  end if;

  if v_servico.valor is null then
    raise exception 'regra: defina o valor do serviço antes da nota';
  end if;

  if v_parcial then
    v_valor := round(p_valor_parcial, 2);
    if v_valor <= 0 then
      raise exception 'regra: o valor da nota precisa ser maior que zero';
    end if;
  else
    v_valor := v_servico.valor;
    select n.* into v_atual
    from public.notas_fiscais n
    where n.servico_id = v_servico.id and not n.parcial and n.status not in ('descartado', 'cancelada')
    for update;
    if v_atual.id is not null and v_atual.status <> 'rascunho' then
      raise exception 'regra: %', case v_atual.status
        when 'aprovado' then 'a nota deste serviço já foi aprovada; emita no Emissor Nacional e registre a emissão'
        when 'emitida' then 'a nota deste serviço já foi emitida'
        else 'a nota deste serviço está divergente; corrija no Emissor Nacional e registre de novo'
      end;
    end if;
  end if;

  -- Soma das notas ativas do serviço (menos a que está sendo refeita).
  select coalesce(sum(n.valor), 0) into v_soma
  from public.notas_fiscais n
  where n.servico_id = v_servico.id
    and n.status not in ('descartado', 'cancelada')
    and n.id is distinct from v_atual.id;
  if v_soma + v_valor > v_servico.valor then
    raise exception 'regra: o valor das notas passa do valor do serviço';
  end if;

  -- Competência: dia do último pagamento, ou hoje; nunca futura.
  select coalesce(sum(p.valor), 0), max((p.criado_em at time zone 'America/Sao_Paulo')::date)
  into v_pago, v_ultimo
  from public.pagamentos p
  where p.servico_id = v_servico.id and p.mei_id = p_mei;
  v_comp := least(coalesce(v_ultimo, v_hoje), v_hoje);
  v_par := public.fiscal_parametros(extract(year from v_comp)::int);
  v_limite := (v_par->>'limite_anual')::numeric;

  -- Aviso: município do local (do serviço, ou endereço do cliente) diferente
  -- do município do MEI, quando o endereço traz a cidade com UF.
  v_local := coalesce(v_servico.local, v_cliente.endereco);
  v_cid_loc := public.fiscal_cidade(v_local);
  v_cid_mei := coalesce(
    public.fiscal_cidade(coalesce(v_mei.municipio, v_mei.cidade)),
    nullif(public.sem_acento(btrim(coalesce(v_mei.municipio, v_mei.cidade, ''))), '')
  );
  if v_cid_loc is not null and v_cid_mei is not null and v_cid_loc <> v_cid_mei then
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', 'municipio_diferente',
      'texto', format('O local do serviço (%s) parece ser fora de %s. Confira o município de prestação no Emissor Nacional.',
                      v_local, coalesce(v_mei.municipio, v_mei.cidade))
    ));
  end if;

  -- Aviso: outra nota ativa do mesmo cliente e mesmo valor, recente.
  select n.numero_seq into v_dup
  from public.notas_fiscais n
  where n.mei_id = p_mei
    and n.cliente_id = v_cliente.id
    and n.valor = v_valor
    and n.status not in ('descartado', 'cancelada')
    and n.id is distinct from v_atual.id
    and n.criado_em >= now() - make_interval(days => (v_par->>'dias_duplicata')::int)
  order by n.criado_em desc
  limit 1;
  if v_dup is not null then
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', 'possivel_duplicata',
      'texto', format('Já existe a nota nº %s para este cliente com o mesmo valor (R$ %s). Confira se não é a mesma.',
                      v_dup, public.fiscal_reais(v_valor))
    ));
  end if;

  -- Aviso: limite do ano. Faturamento = pagamentos do ano dos outros serviços
  -- + o maior entre o já recebido neste serviço e as notas dele (com esta).
  select coalesce(sum(p.valor) filter (where p.servico_id <> v_servico.id), 0),
         coalesce(sum(p.valor) filter (where p.servico_id = v_servico.id), 0)
  into v_outros, v_deste
  from public.pagamentos p
  where p.mei_id = p_mei
    and extract(year from (p.criado_em at time zone 'America/Sao_Paulo'))::int = (v_par->>'ano')::int;
  v_projet := v_outros + greatest(v_deste, v_soma + v_valor);
  if v_projet > v_limite then
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', 'limite_100',
      'texto', format('Com esta nota, o faturamento de %s chega a R$ %s e passa do limite do MEI (R$ %s). Procure um contador.',
                      v_par->>'ano', public.fiscal_reais(v_projet), public.fiscal_reais(v_limite))
    ));
  elsif v_projet >= v_limite * 0.9 then
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', 'limite_90',
      'texto', format('Com esta nota, o faturamento de %s chega a R$ %s, %s%% do limite do MEI (R$ %s).',
                      v_par->>'ano', public.fiscal_reais(v_projet),
                      replace(round(v_projet / v_limite * 100, 1)::text, '.', ','), public.fiscal_reais(v_limite))
    ));
  end if;

  -- Aviso: recebido diferente do valor da nota (parcial: recebido menor que
  -- a soma das notas do serviço).
  if (not v_parcial and v_pago <> v_valor) or (v_parcial and v_pago < v_soma + v_valor) then
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', 'pagamento_diferente',
      'texto', format('O valor recebido neste serviço (R$ %s) é diferente do valor da nota (R$ %s).',
                      public.fiscal_reais(v_pago), public.fiscal_reais(v_valor))
    ));
  end if;

  if v_atual.id is not null then
    update public.notas_fiscais n
    set cliente_id          = v_cliente.id,
        valor               = v_valor,
        competencia         = v_comp,
        descricao           = concat_ws('. ', nullif(btrim(v_mei.descricao_padrao_nota), ''), v_servico.descricao),
        codigo_tributacao   = v_mei.codigo_tributacao,
        nbs                 = v_mei.nbs,
        municipio_prestacao = coalesce(v_mei.municipio, v_mei.cidade),
        tomador_documento   = v_cliente.documento,
        avisos              = v_avisos,
        avisos_confirmados  = false,
        atualizado_em       = now()
    where n.id = v_atual.id
    returning n.* into v_nota;
    return v_nota;
  end if;

  -- Trava o MEI: duas notas simultâneas não pegam o mesmo número.
  perform 1 from public.meis m where m.id = p_mei for update;
  select coalesce(max(n.numero_seq), 0) + 1 into v_numero
  from public.notas_fiscais n
  where n.mei_id = p_mei;

  insert into public.notas_fiscais (
    mei_id, servico_id, cliente_id, numero_seq, valor, parcial, competencia, descricao,
    codigo_tributacao, nbs, municipio_prestacao, tomador_documento, avisos
  )
  values (
    p_mei, v_servico.id, v_cliente.id, v_numero, v_valor, v_parcial, v_comp,
    concat_ws('. ', nullif(btrim(v_mei.descricao_padrao_nota), ''), v_servico.descricao),
    v_mei.codigo_tributacao, v_mei.nbs, coalesce(v_mei.municipio, v_mei.cidade), v_cliente.documento, v_avisos
  )
  returning * into v_nota;
  return v_nota;
end;
$$;

-- Decisão do usuário no cartão: aprovar ou descartar o rascunho. Mesmo
-- contrato do item_decidir: fora de `rascunho` não muda e devolve o status
-- atual (mudou false). Aprovar nota com avisos exige p_avisos_confirmados.
-- Decisão que muda a nota fica em agente_acoes (tipo `decisao`).
create or replace function public.nota_decidir(
  p_mei uuid, p_id uuid, p_decisao text, p_user uuid, p_avisos_confirmados boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_decisao     text := lower(btrim(coalesce(p_decisao, '')));
  v_confirmados boolean := coalesce(p_avisos_confirmados, false);
  v_nota        public.notas_fiscais;
  v_novo        text;
  v_saida       jsonb;
begin
  if v_decisao not in ('aprovar', 'descartar') then
    raise exception 'regra: decisão inválida (use aprovar ou descartar)';
  end if;

  select n.* into v_nota
  from public.notas_fiscais n
  where n.id = p_id and n.mei_id = p_mei
  for update;
  if v_nota.id is null then
    raise exception 'regra: nota não encontrada';
  end if;
  if v_nota.status <> 'rascunho' then
    return jsonb_build_object('id', v_nota.id, 'status', v_nota.status, 'mudou', false);
  end if;

  if v_decisao = 'aprovar' and jsonb_array_length(v_nota.avisos) > 0 and not v_confirmados then
    raise exception 'regra: confirme os avisos antes de aprovar';
  end if;

  v_novo := case v_decisao when 'aprovar' then 'aprovado' else 'descartado' end;
  update public.notas_fiscais n
  set status             = v_novo,
      aprovado_em        = case when v_novo = 'aprovado' then now() end,
      aprovado_por       = case when v_novo = 'aprovado' then p_user end,
      avisos_confirmados = v_novo = 'aprovado' and v_confirmados,
      atualizado_em      = now()
  where n.id = v_nota.id;

  v_saida := jsonb_build_object('id', v_nota.id, 'status', v_novo, 'mudou', true);

  insert into public.agente_acoes (mei_id, tipo, nome, entrada, saida, user_id)
  values (
    p_mei, 'decisao', v_decisao,
    jsonb_build_object('tipo', 'nota', 'id', v_nota.id, 'decisao', v_decisao, 'avisos_confirmados', v_confirmados),
    v_saida, p_user
  );

  return v_saida;
end;
$$;

-- O usuário registra a nota que emitiu no Emissor Nacional (dados do XML
-- conferido no TS, ou digitados). p_dados: {numero_nfse, chave_acesso?,
-- valor?, tomador_documento?, competencia?, codigo_tributacao?}. Cada campo
-- presente é comparado com a nota: sem diferença → `emitida` (fecha as
-- tarefas emitir_nota/corrigir_nota do serviço); com diferença → `divergente`,
-- `conferencia = {campo: {esperado, emitido}}` e tarefa `corrigir_nota`.
-- Já emitida: os mesmos dados devolvem o estado atual; outros dados = regra.
create or replace function public.nota_registrar_emissao(p_mei uuid, p_id uuid, p_dados jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_nota   public.notas_fiscais;
  v_numero text := nullif(btrim(p_dados->>'numero_nfse'), '');
  v_chave  text := nullif(btrim(p_dados->>'chave_acesso'), '');
  v_texto  text;
  v_valor  numeric;
  v_doc    text;
  v_comp   date;
  v_codigo text;
  v_dif    jsonb := '{}'::jsonb;
begin
  select n.* into v_nota
  from public.notas_fiscais n
  where n.id = p_id and n.mei_id = p_mei
  for update;
  if v_nota.id is null then
    raise exception 'regra: nota não encontrada';
  end if;
  if v_nota.status = 'rascunho' then
    raise exception 'regra: aprove a nota antes de registrar a emissão';
  elsif v_nota.status = 'descartado' then
    raise exception 'regra: esta nota foi descartada';
  elsif v_nota.status = 'cancelada' then
    raise exception 'regra: esta nota foi cancelada';
  end if;
  if v_numero is null then
    raise exception 'regra: informe o número da NFS-e';
  end if;
  if length(v_numero) > 60 then
    raise exception 'regra: número da NFS-e inválido';
  end if;

  v_texto := nullif(btrim(p_dados->>'valor'), '');
  if v_texto is not null then
    -- "1.234,56" (formato brasileiro) ou "1234.56".
    if v_texto ~ ',' then
      v_texto := replace(replace(v_texto, '.', ''), ',', '.');
    end if;
    begin
      v_valor := round(v_texto::numeric, 2);
    exception when others then
      raise exception 'regra: valor da nota emitida inválido';
    end;
    if v_valor is distinct from v_nota.valor then
      v_dif := v_dif || jsonb_build_object('valor', jsonb_build_object('esperado', v_nota.valor, 'emitido', v_valor));
    end if;
  end if;

  -- Mesma normalização do documento_valido (CNPJ pode ter letras).
  v_doc := nullif(upper(regexp_replace(coalesce(p_dados->>'tomador_documento', ''), '[\s./-]', '', 'g')), '');
  if v_doc is not null and v_doc <> v_nota.tomador_documento then
    v_dif := v_dif || jsonb_build_object('tomador_documento',
      jsonb_build_object('esperado', v_nota.tomador_documento, 'emitido', v_doc));
  end if;

  v_texto := nullif(btrim(p_dados->>'competencia'), '');
  if v_texto is not null then
    if v_texto !~ '^\d{4}-\d{2}-\d{2}' then
      raise exception 'regra: competência inválida (use AAAA-MM-DD)';
    end if;
    begin
      v_comp := left(v_texto, 10)::date;
    exception when others then
      raise exception 'regra: competência inválida (use AAAA-MM-DD)';
    end;
    if v_comp <> v_nota.competencia then
      v_dif := v_dif || jsonb_build_object('competencia',
        jsonb_build_object('esperado', v_nota.competencia, 'emitido', v_comp));
    end if;
  end if;

  v_codigo := nullif(regexp_replace(coalesce(p_dados->>'codigo_tributacao', ''), '\D', '', 'g'), '');
  if v_codigo is not null then
    if length(v_codigo) = 5 then
      v_codigo := lpad(v_codigo, 6, '0');
    end if;
    if v_codigo <> v_nota.codigo_tributacao then
      v_dif := v_dif || jsonb_build_object('codigo_tributacao',
        jsonb_build_object('esperado', v_nota.codigo_tributacao, 'emitido', v_codigo));
    end if;
  end if;

  if v_nota.status = 'emitida' then
    if v_dif = '{}'::jsonb and v_numero = v_nota.numero_nfse then
      if v_chave is not null and v_nota.chave_acesso is null then
        update public.notas_fiscais n set chave_acesso = v_chave, atualizado_em = now() where n.id = v_nota.id;
      end if;
      return jsonb_build_object('status', 'emitida', 'diferencas', '{}'::jsonb);
    end if;
    raise exception 'regra: esta nota já foi registrada como emitida (NFS-e nº %)', v_nota.numero_nfse;
  end if;

  if v_dif = '{}'::jsonb then
    update public.notas_fiscais n
    set status        = 'emitida',
        emitida_em    = now(),
        numero_nfse   = v_numero,
        chave_acesso  = coalesce(v_chave, n.chave_acesso),
        conferencia   = '{}'::jsonb,
        atualizado_em = now()
    where n.id = v_nota.id;

    update public.tarefas t
    set status = 'feita'
    where t.servico_id = v_nota.servico_id
      and t.mei_id = p_mei
      and t.tipo in ('emitir_nota', 'corrigir_nota')
      and t.status = 'aberta';

    return jsonb_build_object('status', 'emitida', 'diferencas', '{}'::jsonb);
  end if;

  update public.notas_fiscais n
  set status        = 'divergente',
      numero_nfse   = v_numero,
      chave_acesso  = coalesce(v_chave, n.chave_acesso),
      conferencia   = v_dif,
      atualizado_em = now()
  where n.id = v_nota.id;

  insert into public.tarefas as t (mei_id, servico_id, tipo, vencimento)
  values (p_mei, v_nota.servico_id, 'corrigir_nota', public.hoje_sp())
  on conflict (servico_id, tipo) where status = 'aberta' do nothing;

  return jsonb_build_object('status', 'divergente', 'diferencas', v_dif);
end;
$$;

-- Nota com o MEI (sem user_id), o cliente e o serviço, para cartão e tela.
create or replace function public.nota_ver(p_mei uuid, p_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_nota public.notas_fiscais;
begin
  select n.* into v_nota
  from public.notas_fiscais n
  where n.id = p_id and n.mei_id = p_mei;
  if v_nota.id is null then
    raise exception 'regra: nota não encontrada';
  end if;

  return jsonb_build_object(
    'nota', to_jsonb(v_nota),
    'mei', (select to_jsonb(m) - 'user_id' from public.meis m where m.id = p_mei),
    'cliente', (select to_jsonb(c) from public.clientes c where c.id = v_nota.cliente_id and c.mei_id = p_mei),
    'servico', (select to_jsonb(s) from public.servicos s where s.id = v_nota.servico_id and s.mei_id = p_mei)
  );
end;
$$;

-- Notas do MEI, mais recentes primeiro, com o nome do cliente e o número do
-- serviço. Com `p_status`, só as desse status.
create or replace function public.notas_listar(p_mei uuid, p_status text default null)
returns table (
  id                  uuid,
  mei_id              uuid,
  servico_id          uuid,
  cliente_id          uuid,
  numero_seq          int,
  valor               numeric,
  parcial             boolean,
  competencia         date,
  descricao           text,
  codigo_tributacao   text,
  nbs                 text,
  municipio_prestacao text,
  tomador_documento   text,
  avisos              jsonb,
  avisos_confirmados  boolean,
  status              text,
  aprovado_em         timestamptz,
  aprovado_por        uuid,
  emitida_em          timestamptz,
  numero_nfse         text,
  chave_acesso        text,
  conferencia         jsonb,
  criado_em           timestamptz,
  atualizado_em       timestamptz,
  cliente_nome        text,
  servico_numero      int
)
language sql
stable
set search_path = ''
as $$
  select n.id, n.mei_id, n.servico_id, n.cliente_id, n.numero_seq, n.valor, n.parcial, n.competencia,
         n.descricao, n.codigo_tributacao, n.nbs, n.municipio_prestacao, n.tomador_documento, n.avisos,
         n.avisos_confirmados, n.status, n.aprovado_em, n.aprovado_por, n.emitida_em, n.numero_nfse,
         n.chave_acesso, n.conferencia, n.criado_em, n.atualizado_em, c.nome, s.numero
  from public.notas_fiscais n
  join public.clientes c on c.id = n.cliente_id
  join public.servicos s on s.id = n.servico_id
  where n.mei_id = p_mei
    and (nullif(btrim(p_status), '') is null or n.status = lower(btrim(p_status)))
  order by n.criado_em desc, n.numero_seq desc;
$$;

-- ---------------------------------------------------------------------------
-- Faturamento e pendências
-- ---------------------------------------------------------------------------

-- Faturamento do ano (nulo = ano de hoje): pagamentos recebidos no ano em
-- America/Sao_Paulo. `com_nota` = parte coberta por notas emitidas com
-- competência no ano. Projeção linear até 31/12 no ano corrente. Faixas pelo
-- total: atencao ≥ 70%, alerta ≥ 90%, excedido > 100%, excedido_grave >
-- 100% + tolerância.
create or replace function public.faturamento_ano(p_mei uuid, p_ano int default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_par    jsonb := public.fiscal_parametros(p_ano);
  v_ano    int := (v_par->>'ano')::int;
  v_limite numeric := (v_par->>'limite_anual')::numeric;
  v_tol    numeric := (v_par->>'tolerancia_excesso')::numeric;
  v_hoje   date := public.hoje_sp();
  v_total  numeric;
  v_notas  numeric;
  v_com    numeric;
  v_proj   numeric;
  v_faixa  text;
begin
  select coalesce(sum(p.valor), 0) into v_total
  from public.pagamentos p
  where p.mei_id = p_mei
    and extract(year from (p.criado_em at time zone 'America/Sao_Paulo'))::int = v_ano;

  select coalesce(sum(n.valor), 0) into v_notas
  from public.notas_fiscais n
  where n.mei_id = p_mei
    and n.status = 'emitida'
    and extract(year from n.competencia)::int = v_ano;
  v_com := least(v_total, v_notas);

  if v_ano = extract(year from v_hoje)::int then
    v_proj := round(
      v_total * (make_date(v_ano + 1, 1, 1) - make_date(v_ano, 1, 1))
              / ((v_hoje - make_date(v_ano, 1, 1)) + 1),
      2);
  else
    v_proj := v_total;
  end if;

  v_faixa := case
    when v_total > v_limite * (1 + v_tol) then 'excedido_grave'
    when v_total > v_limite then 'excedido'
    when v_total >= v_limite * 0.9 then 'alerta'
    when v_total >= v_limite * 0.7 then 'atencao'
    else 'ok'
  end;

  return jsonb_build_object(
    'ano', v_ano,
    'total', v_total,
    'com_nota', v_com,
    'sem_nota', v_total - v_com,
    'limite', v_par->'limite_anual',
    'percentual', round(v_total / v_limite * 100, 1),
    'projecao', v_proj,
    'faixa', v_faixa
  );
end;
$$;

-- Agendador (todos os MEIs): abre tarefa `emitir_nota` para serviço pago de
-- cliente PJ (documento de 14 posições), pago há `p_dias` ou mais (nulo =
-- dias_para_emitir), sem nota ativa e sem tarefa emitir_nota anterior (aberta,
-- feita ou ignorada: o usuário já foi lembrado). Devolve só as novas.
create or replace function public.tarefas_gerar_notas(p_dias int default null)
returns table (mei_id uuid, tarefa_id uuid, servico_id uuid)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_dias int := coalesce(p_dias, (public.fiscal_parametros()->>'dias_para_emitir')::int);
  v_hoje date := public.hoje_sp();
begin
  if v_dias < 0 or v_dias > 365 then
    raise exception 'regra: os dias para emitir precisam ser entre 0 e 365';
  end if;

  return query
  with candidatos as (
    select s.mei_id, s.id as servico_id
    from public.servicos s
    join public.clientes c on c.id = s.cliente_id and c.mei_id = s.mei_id
    where s.status = 'pago'
      and length(c.documento) = 14
      and (
        select max((p.criado_em at time zone 'America/Sao_Paulo')::date)
        from public.pagamentos p
        where p.servico_id = s.id
      ) <= v_hoje - v_dias
      and not exists (
        select 1 from public.notas_fiscais n
        where n.servico_id = s.id and n.status not in ('descartado', 'cancelada')
      )
      and not exists (
        select 1 from public.tarefas t
        where t.servico_id = s.id and t.tipo = 'emitir_nota'
      )
  ),
  novas as (
    insert into public.tarefas as t (mei_id, servico_id, tipo, vencimento)
    select c.mei_id, c.servico_id, 'emitir_nota', v_hoje
    from candidatos c
    on conflict (servico_id, tipo) where status = 'aberta' do nothing
    returning t.mei_id, t.id, t.servico_id
  )
  select n.mei_id, n.id, n.servico_id from novas n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mensagens: envio de nota
-- ---------------------------------------------------------------------------

-- `nota_id` só aponta para nota do mesmo MEI; `envio_nota` só com nota
-- emitida e para o cliente da nota (vale também para insert/update direto).
create or replace function public.mensagens_nota_valida()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nota public.notas_fiscais;
begin
  if new.nota_id is not null then
    select n.* into v_nota
    from public.notas_fiscais n
    where n.id = new.nota_id and n.mei_id = new.mei_id;
    if v_nota.id is null then
      raise exception 'regra: nota não encontrada';
    end if;
  end if;
  if new.objetivo = 'envio_nota' and (
    v_nota.id is null
    or v_nota.status <> 'emitida'
    or new.cliente_id is distinct from v_nota.cliente_id
  ) then
    raise exception 'regra: só dá para mandar nota já emitida, para o cliente da nota';
  end if;
  return new;
end;
$$;

drop trigger if exists mensagens_nota_valida on public.mensagens;
create trigger mensagens_nota_valida
  before insert or update of objetivo, nota_id, cliente_id on public.mensagens
  for each row execute function public.mensagens_nota_valida();

-- Redefine a do 04-documentos.sql: aceita `envio_nota` e `nota_id`.
-- p_dados: {canal, objetivo, conteudo, cliente_id?, servico_id?, tarefa_id?,
-- nota_id?}. Com serviço e sem cliente, o cliente é o do serviço; com nota e
-- sem cliente, o cliente (e o serviço) é o da nota. `envio_nota` exige nota.
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
  v_nota     public.notas_fiscais;
  v_msg      public.mensagens;
begin
  if v_canal is null or v_canal not in ('whatsapp', 'instagram') then
    raise exception 'regra: canal inválido (use whatsapp ou instagram)';
  end if;
  if v_objetivo is null or v_objetivo not in ('confirmacao', 'envio_orcamento', 'lembrete', 'cobranca', 'post', 'outro', 'envio_nota') then
    raise exception 'regra: objetivo inválido (use confirmacao, envio_orcamento, lembrete, cobranca, post, outro ou envio_nota)';
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

  if nullif(btrim(p_dados->>'nota_id'), '') is not null then
    select n.* into v_nota
    from public.notas_fiscais n
    where n.id = public.uuid_ou_nulo(p_dados->>'nota_id') and n.mei_id = p_mei;
    if v_nota.id is null then
      raise exception 'regra: nota não encontrada';
    end if;
    if v_cliente is null then
      v_cliente := v_nota.cliente_id;
    end if;
    -- O serviço da nota só entra quando o cliente é o dela; cliente diferente
    -- cai na regra do envio de nota (trigger), com a frase certa.
    if v_servico.id is null and v_cliente = v_nota.cliente_id then
      select s.* into v_servico from public.servicos s where s.id = v_nota.servico_id and s.mei_id = p_mei;
    end if;
  end if;

  if v_objetivo = 'envio_orcamento' and v_servico.id is null then
    raise exception 'regra: informe o serviço do orçamento';
  end if;
  if v_objetivo = 'envio_nota' and v_nota.id is null then
    raise exception 'regra: informe a nota a enviar';
  end if;

  if nullif(btrim(p_dados->>'tarefa_id'), '') is not null then
    v_tarefa := public.uuid_ou_nulo(p_dados->>'tarefa_id');
    if v_tarefa is null then
      raise exception 'regra: tarefa não encontrada';
    end if;
  end if;

  insert into public.mensagens (mei_id, cliente_id, servico_id, canal, objetivo, conteudo, tarefa_id, nota_id)
  values (p_mei, v_cliente, v_servico.id, v_canal, v_objetivo, v_conteudo, v_tarefa, v_nota.id)
  returning * into v_msg;

  return v_msg;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notas a emitir (tela Notas, Task 17d)
-- ---------------------------------------------------------------------------

-- Tarefas `emitir_nota` abertas do MEI, com o serviço e o cliente, por
-- vencimento. Tarefa feita (nota emitida) ou ignorada não aparece.
create or replace function public.notas_a_emitir(p_mei uuid)
returns table (
  tarefa_id            uuid,
  servico_id           uuid,
  numero               int,
  descricao            text,
  valor                numeric,
  cliente_id           uuid,
  cliente_nome         text,
  vencimento           date,
  dias_desde_pagamento int
)
language sql
stable
set search_path = ''
as $$
  select t.id, s.id, s.numero, s.descricao, s.valor, c.id, c.nome, t.vencimento,
         public.hoje_sp() - (
           select max((p.criado_em at time zone 'America/Sao_Paulo')::date)
           from public.pagamentos p
           where p.servico_id = s.id and p.mei_id = p_mei
         )
  from public.tarefas t
  join public.servicos s on s.id = t.servico_id and s.mei_id = p_mei
  join public.clientes c on c.id = s.cliente_id and c.mei_id = p_mei
  where t.mei_id = p_mei
    and t.tipo = 'emitir_nota'
    and t.status = 'aberta'
  order by t.vencimento, s.numero;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o servidor (service_role) chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.fiscal_parametros(int) from public, anon, authenticated;
revoke execute on function public.documento_valido(text) from public, anon, authenticated;
revoke execute on function public.fiscal_codigo_tributacao_valido(text) from public, anon, authenticated;
revoke execute on function public.fiscal_nbs_valido(text) from public, anon, authenticated;
revoke execute on function public.fiscal_cidade(text) from public, anon, authenticated;
revoke execute on function public.fiscal_reais(numeric) from public, anon, authenticated;
revoke execute on function public.mei_dados_fiscais_salvar(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.cliente_documento_salvar(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.nota_preparar(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.nota_decidir(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.nota_registrar_emissao(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.nota_ver(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notas_listar(uuid, text) from public, anon, authenticated;
revoke execute on function public.faturamento_ano(uuid, int) from public, anon, authenticated;
revoke execute on function public.tarefas_gerar_notas(int) from public, anon, authenticated;
revoke execute on function public.notas_a_emitir(uuid) from public, anon, authenticated;
revoke execute on function public.mensagens_nota_valida() from public, anon, authenticated;
revoke execute on function public.mensagem_rascunhar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fiscal_parametros(int) to service_role;
grant execute on function public.documento_valido(text) to service_role;
grant execute on function public.fiscal_codigo_tributacao_valido(text) to service_role;
grant execute on function public.fiscal_nbs_valido(text) to service_role;
grant execute on function public.fiscal_cidade(text) to service_role;
grant execute on function public.fiscal_reais(numeric) to service_role;
grant execute on function public.mei_dados_fiscais_salvar(uuid, jsonb) to service_role;
grant execute on function public.cliente_documento_salvar(uuid, uuid, text) to service_role;
grant execute on function public.nota_preparar(uuid, uuid, numeric) to service_role;
grant execute on function public.nota_decidir(uuid, uuid, text, uuid, boolean) to service_role;
grant execute on function public.nota_registrar_emissao(uuid, uuid, jsonb) to service_role;
grant execute on function public.nota_ver(uuid, uuid) to service_role;
grant execute on function public.notas_listar(uuid, text) to service_role;
grant execute on function public.faturamento_ano(uuid, int) to service_role;
grant execute on function public.tarefas_gerar_notas(int) to service_role;
grant execute on function public.notas_a_emitir(uuid) to service_role;
grant execute on function public.mensagem_rascunhar(uuid, jsonb) to service_role;

-- O PostgREST precisa enxergar as tabelas e as funções novas sem esperar.
notify pgrst, 'reload schema';
