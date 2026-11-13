-- Demo local. Substitua <EMAIL_DO_USUARIO> pelo email cadastrado em /setup.
-- Rode depois de 01-auth.sql a 05-pendencias.sql. Pode rodar novamente.
-- Usa funções de domínio; as escritas diretas abaixo fixam o número #009 e
-- simulam o envio ocorrido há quatro dias, que não têm função própria.
do $demo$
declare
  v_user uuid;
  v_mei uuid;
  v_ana uuid;
  v_bruna uuid;
  v_carlos uuid;
  v_daniela uuid;
  v_eduardo uuid;
  v_servico uuid;
  v_orc uuid;
  v_msg uuid;
  v_enviado timestamptz := ((public.hoje_sp() - 4)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo';
begin
  select id into v_user from public.users where lower(email) = lower('<EMAIL_DO_USUARIO>');
  if v_user is null then
    raise exception 'Cadastre o usuário em /setup antes de rodar o seed';
  end if;

  select id into v_mei from public.mei_salvar(v_user, jsonb_build_object(
    'nome', 'Refrigeração Bueno', 'atividade', 'técnico de manutenção', 'cidade', 'Goiânia'));

  select id into v_ana from public.cliente_salvar(v_mei, '{"nome":"Ana Martins","whatsapp":"62 99999-1001","endereco":"Setor Bueno, Goiânia"}'::jsonb);
  select id into v_bruna from public.cliente_salvar(v_mei, '{"nome":"Bruna Costa","whatsapp":"62 99999-1002","endereco":"Setor Oeste, Goiânia"}'::jsonb);
  select id into v_carlos from public.cliente_salvar(v_mei, '{"nome":"Carlos Bueno","whatsapp":"62 99999-1003","endereco":"Setor Sul, Goiânia"}'::jsonb);
  select id into v_daniela from public.cliente_salvar(v_mei, '{"nome":"Daniela Lima","whatsapp":"62 99999-1004","endereco":"Setor Marista, Goiânia"}'::jsonb);
  select id into v_eduardo from public.cliente_salvar(v_mei, '{"nome":"Eduardo Alves","whatsapp":"62 99999-1005","endereco":"Jardim América, Goiânia"}'::jsonb);

  if not exists (select 1 from public.servicos where mei_id = v_mei and descricao = 'Manutenção de ar-condicionado concluída') then
    select id into v_servico from public.servico_registrar(v_mei, jsonb_build_object(
      'cliente_id', v_ana, 'descricao', 'Manutenção de ar-condicionado concluída',
      'valor', 320, 'forma_pagamento', 'pix', 'fechado', true));
    perform public.servico_mudar_status(v_mei, v_servico, 'executado');
    perform public.pagamento_registrar(v_mei, v_servico, 320, 'pix');
  end if;

  if not exists (select 1 from public.servicos where mei_id = v_mei and descricao = 'Revisão de freezer agendada') then
    select id into v_servico from public.servico_registrar(v_mei, jsonb_build_object(
      'cliente_id', v_bruna, 'descricao', 'Revisão de freezer agendada',
      'valor', 280, 'forma_pagamento', 'pix', 'fechado', true));
    perform public.servico_agendar(v_mei, v_servico,
      ((public.hoje_sp() + 1)::timestamp + interval '9 hours') at time zone 'America/Sao_Paulo',
      'Setor Oeste, Goiânia');
  end if;

  if not exists (select 1 from public.servicos where mei_id = v_mei and descricao = 'Troca de fiação' and cliente_id = v_carlos) then
    -- O número é da proposta do README. servico_registrar só aloca o próximo.
    insert into public.servicos (mei_id, cliente_id, numero, descricao, valor, forma_pagamento, status)
    values (v_mei, v_carlos, 9, 'Troca de fiação', 450, 'pix', 'rascunho')
    returning id into v_servico;
    select id into v_orc from public.orcamento_gerar(v_mei, v_servico);
    perform public.item_decidir(v_mei, 'orcamento', v_orc, 'aprovar', v_user);
    select id into v_msg from public.mensagem_rascunhar(v_mei, jsonb_build_object(
      'canal', 'whatsapp', 'objetivo', 'envio_orcamento', 'servico_id', v_servico,
      'conteudo', 'Oi, Carlos! Segue o orçamento #009 para a troca de fiação, no valor de R$ 450.'));
    perform public.item_decidir(v_mei, 'mensagem', v_msg, 'aprovar', v_user);
    perform public.mensagem_marcar_enviada(v_mei, v_msg);
    update public.orcamentos set enviado_em = v_enviado where id = v_orc and mei_id = v_mei;
    update public.mensagens set enviado_em = v_enviado where id = v_msg and mei_id = v_mei;
  end if;
end
$demo$;
