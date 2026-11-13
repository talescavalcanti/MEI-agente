-- Demo completa, com dados SINTÉTICOS (nomes, telefones e endereços inventados).
-- Como rodar:
--   1. Rode supabase/01-auth.sql até supabase/10-conhecimento.sql, em ordem.
--   2. Cadastre em /setup uma conta SEPARADA da usada no demo.sql (é um MEI
--      por usuário: rodar os dois na mesma conta renomeia o MEI).
--   3. Troque <EMAIL_DO_USUARIO> pelo email dessa conta e execute este arquivo.
-- Pode rodar de novo: serviço já criado (pela descrição) é pulado, e memória e
-- conhecimento não duplicam.
--
-- Cobre todas as telas e ferramentas: serviços nos 8 status, agenda passada e
-- futura, pagamentos integral e parcial, orçamento e contrato em rascunho,
-- aprovado e descartado, mensagens em todos os status, post de Instagram,
-- propostas paradas com tarefa aberta, feita e ignorada, memórias e a base de
-- conhecimento. Usa as funções de domínio; as escritas diretas só recuam
-- datas (criado_em, enviado_em), que não têm função própria.
do $demo$
declare
  v_user     uuid;
  v_mei      uuid;
  v_cli      jsonb := '{}'::jsonb;
  v_id       uuid;
  r          record;
  v_cliente  public.clientes;
  v_srv      public.servicos;
  v_orc      uuid;
  v_ctr      uuid;
  v_msg      uuid;
  v_tar      uuid;
  v_quando   timestamptz;
  v_fechado  boolean;
  v_com_orc  boolean;
  v_contato  text;

  v_clientes jsonb := $j$[
    {"k":"ana",      "nome":"Ana Ribeiro",                 "whatsapp":"62 90000-0001", "endereco":"Rua Exemplo 1, nº 120, apto 802, Setor Bueno, Goiânia"},
    {"k":"beto",     "nome":"Roberto Souza",               "whatsapp":"62 90000-0002", "endereco":"Rua Exemplo 2, nº 45, Setor Oeste, Goiânia"},
    {"k":"carla",    "nome":"Carla Mendes",                "whatsapp":"62 90000-0003", "endereco":"Rua Exemplo 3, nº 300, Setor Marista, Goiânia"},
    {"k":"condo",    "nome":"Condomínio Residencial Ipê",  "whatsapp":"62 90000-0004", "endereco":"Avenida Exemplo 4, nº 1000, Jardim Goiás, Goiânia", "observacoes":"Cliente com manutenção mensal. Falar com a síndica."},
    {"k":"diego",    "nome":"Diego Fontes",                "whatsapp":"62 90000-0005", "endereco":"Rua Exemplo 5, nº 18, Setor Sul, Goiânia"},
    {"k":"elisa",    "nome":"Elisa Prado",                 "whatsapp":"62 90000-0006", "endereco":"Rua Exemplo 6, nº 77, Jardim América, Goiânia"},
    {"k":"fabio",    "nome":"Fábio Teles",                 "whatsapp":"62 90000-0007", "endereco":"Rua Exemplo 7, nº 210, Setor Pedro Ludovico, Goiânia"},
    {"k":"gisele",   "nome":"Gisele Amaral",               "whatsapp":"62 90000-0008", "endereco":"Rua Exemplo 8, nº 9, Setor Coimbra, Goiânia"},
    {"k":"hugo",     "nome":"Hugo Paiva",                  "whatsapp":"62 90000-0009", "endereco":"Rua Exemplo 9, nº 501, Setor Aeroporto, Goiânia"},
    {"k":"iris",     "nome":"Íris Campos",                 "whatsapp":"62 90000-0010", "endereco":"Rua Exemplo 10, nº 33, Setor Bela Vista, Goiânia"},
    {"k":"joao",     "nome":"João Vitor Rocha",            "whatsapp":"62 90000-0011", "endereco":"Rua Exemplo 11, nº 150, Vila Nova, Goiânia"},
    {"k":"karina",   "nome":"Karina Lopes",                "whatsapp":"62 90000-0012", "endereco":"Rua Exemplo 12, nº 64, Setor Universitário, Goiânia"},
    {"k":"leo",      "nome":"Leonardo Matos",              "whatsapp":"62 90000-0013", "endereco":"Rua Exemplo 13, nº 820, Parque Amazônia, Goiânia"},
    {"k":"marta",    "nome":"Marta Siqueira",              "whatsapp":"62 90000-0014", "endereco":"Rua Exemplo 14, nº 12, Setor Nova Suíça, Goiânia"},
    {"k":"nina",     "nome":"Nina Barros",                 "whatsapp":"62 90000-0015", "endereco":"Rua Exemplo 15, nº 400, Jardim Europa, Goiânia"},
    {"k":"osvaldo",  "nome":"Osvaldo Pires",               "whatsapp":"62 90000-0016", "endereco":"Avenida Exemplo 16, nº 1500, loja 3, Setor Campinas, Goiânia"},
    {"k":"paula",    "nome":"Paula Nogueira",              "whatsapp":"62 90000-0017", "endereco":"Rua Exemplo 17, nº 88, Setor Leste Universitário, Goiânia"},
    {"k":"renato",   "nome":"Renato Freitas",              "whatsapp":"62 90000-0018", "endereco":"Rua Exemplo 18, nº 260, Setor dos Funcionários, Goiânia"},
    {"k":"sueli",    "nome":"Sueli Andrade",               "whatsapp":"62 90000-0019", "endereco":"Rua Exemplo 19, nº 5, Cidade Jardim, Goiânia"},
    {"k":"tiago",    "nome":"Tiago Moreira",               "whatsapp":"62 90000-0020", "endereco":"Avenida Exemplo 20, nº 700, sala 12, Setor Central, Goiânia"}
  ]$j$;

  -- cenario: pago | pago_2x | executado_parcial | executado_aberto | agendado |
  --          confirmado | aguardando | orcado | orcado_descartado | rascunho | cancelado
  -- d/h: dia relativo a hoje e hora (agenda, envio do orçamento).
  -- orc: passa por orçamento aprovado (nos cenários em que isso é opcional).
  -- contrato: rascunho | aprovado | descartado. tarefa: aberta | lembrete_rascunho | feita | ignorada.
  -- msg/msg_obj/msg_status: uma mensagem a mais ligada ao serviço.
  v_servicos jsonb := $j$[
    {"cli":"ana",    "descr":"Instalação de split 12.000 BTUs na sala", "valor":450, "forma":"pix", "cenario":"pago", "d":-45, "h":9, "orc":true, "contrato":"aprovado",
     "itens":[{"descricao":"Mão de obra de instalação","valor":330},{"descricao":"Suporte e 3 m de tubulação","valor":120}]},
    {"cli":"beto",   "descr":"Limpeza completa de dois splits", "valor":300, "forma":"pix", "cenario":"pago", "d":-30, "h":14},
    {"cli":"carla",  "descr":"Troca de disjuntores do quadro geral", "valor":380, "forma":"dinheiro", "cenario":"pago", "d":-21, "h":10, "orc":true},
    {"cli":"condo",  "descr":"Manutenção preventiva mensal das áreas comuns (outubro)", "valor":900, "forma":"pix", "cenario":"pago", "d":-18, "h":8, "contrato":"aprovado"},
    {"cli":"diego",  "descr":"Conserto de geladeira frost free com troca do termostato", "valor":260, "forma":"cartao", "cenario":"pago", "d":-12, "h":15},
    {"cli":"elisa",  "descr":"Instalação de chuveiro elétrico e troca de resistência", "valor":180, "forma":"pix", "cenario":"pago", "d":-9, "h":11},
    {"cli":"fabio",  "descr":"Instalação de dois splits 9.000 BTUs nos quartos", "valor":1600, "forma":"parcelado", "cenario":"pago_2x", "d":-15, "h":8, "orc":true, "contrato":"aprovado",
     "itens":[{"descricao":"Mão de obra (2 aparelhos)","valor":1200},{"descricao":"Suportes e tubulação","valor":400}]},
    {"cli":"gisele", "descr":"Recarga de gás e troca do capacitor do split", "valor":350, "forma":"pix", "cenario":"executado_parcial", "d":-3, "h":9,
     "msg":"Oi, Gisele! O serviço do split ficou pronto. Falta o restante de R$ 175,00. Pode ser por Pix?", "msg_obj":"cobranca", "msg_status":"rascunho"},
    {"cli":"hugo",   "descr":"Reparo na fiação da cozinha", "valor":420, "forma":"pix", "cenario":"executado_aberto", "d":-2, "h":14,
     "msg":"Oi, Hugo! O reparo da fiação da cozinha ficou em R$ 420,00. Segue a chave Pix para o pagamento.", "msg_obj":"cobranca", "msg_status":"aprovado"},
    {"cli":"condo",  "descr":"Troca de lâmpadas e reatores da garagem", "valor":650, "forma":"pix", "cenario":"executado_aberto", "d":-1, "h":8},
    {"cli":"iris",   "descr":"Instalação de split 18.000 BTUs na sala", "valor":700, "forma":"pix", "cenario":"agendado", "d":0, "h":16, "contrato":"aprovado",
     "msg":"Oi, Íris! Confirmando a instalação do split hoje às 16h. Deixe a parede da sala livre, por favor.", "msg_obj":"lembrete", "msg_status":"aprovado"},
    {"cli":"joao",   "descr":"Manutenção de máquina de lavar que não centrifuga", "valor":220, "forma":"dinheiro", "cenario":"agendado", "d":1, "h":9,
     "msg":"Oi, João! Confirmo a visita amanhã às 9h para ver a máquina de lavar.", "msg_obj":"confirmacao", "msg_status":"rascunho"},
    {"cli":"karina", "descr":"Limpeza e higienização de split", "valor":160, "forma":"pix", "cenario":"agendado", "d":2, "h":10},
    {"cli":"leo",    "descr":"Instalação de tomadas 20A na área de serviço", "valor":340, "forma":"pix", "cenario":"agendado", "d":4, "h":14, "contrato":"rascunho"},
    {"cli":"condo",  "descr":"Manutenção preventiva mensal das áreas comuns (novembro)", "valor":900, "forma":"pix", "cenario":"agendado", "d":6, "h":8, "contrato":"aprovado"},
    {"cli":"marta",  "descr":"Troca do compressor da geladeira duplex", "valor":980, "forma":"parcelado", "cenario":"confirmado", "orc":true, "contrato":"rascunho"},
    {"cli":"nina",   "descr":"Instalação de ventilador de teto em dois quartos", "valor":240, "forma":"pix", "cenario":"confirmado"},
    {"cli":"osvaldo","descr":"Instalação de split 24.000 BTUs na loja", "valor":1200, "forma":"pix", "cenario":"aguardando", "d":-12, "tarefa":"ignorada"},
    {"cli":"paula",  "descr":"Revisão elétrica completa do apartamento", "valor":750, "forma":"pix", "cenario":"aguardando", "d":-8, "tarefa":"feita"},
    {"cli":"renato", "descr":"Troca do quadro de distribuição", "valor":1100, "forma":"parcelado", "cenario":"aguardando", "d":-5, "tarefa":"lembrete_rascunho"},
    {"cli":"sueli",  "descr":"Conserto de freezer horizontal", "valor":290, "forma":"dinheiro", "cenario":"aguardando", "d":-4, "tarefa":"aberta"},
    {"cli":"tiago",  "descr":"Limpeza de três splits do escritório", "valor":420, "forma":"pix", "cenario":"aguardando", "d":-1},
    {"cli":"ana",    "descr":"Instalação de split 12.000 BTUs no quarto", "valor":800, "forma":"pix", "cenario":"orcado",
     "msg":"Oi, Ana! O orçamento da instalação do split no quarto ficou em R$ 80. Posso agendar?", "msg_obj":"envio_orcamento", "msg_status":"rascunho"},
    {"cli":"beto",   "descr":"Instalação de exaustor na cozinha", "valor":280, "forma":"pix", "cenario":"orcado"},
    {"cli":"carla",  "descr":"Manutenção do motor do portão eletrônico", "valor":380, "forma":"pix", "cenario":"orcado_descartado",
     "msg":"Oi, Carla! O orçamento do portão ficou em R$ 380,00.", "msg_obj":"envio_orcamento", "msg_status":"descartado"},
    {"cli":"karina", "descr":"Instalação de split no escritório de casa", "cenario":"rascunho"},
    {"cli":"joao",   "descr":"Iluminação do jardim com refletores", "cenario":"rascunho"},
    {"cli":"diego",  "descr":"Instalação de ar-condicionado portátil", "valor":300, "forma":"pix", "cenario":"cancelado", "orc":true, "contrato":"descartado"},
    {"cli":"hugo",   "descr":"Troca de resistência do forno elétrico", "valor":150, "forma":"dinheiro", "cenario":"cancelado"}
  ]$j$;

  v_conhecimento jsonb := $j$[
    {"tipo":"preco", "titulo":"Instalação de split até 12.000 BTUs", "conteudo":"R$ 450,00 de mão de obra, com suporte e até 3 m de tubulação. Metro extra de tubulação: R$ 60,00."},
    {"tipo":"preco", "titulo":"Instalação de split de 18.000 a 24.000 BTUs", "conteudo":"De R$ 700,00 (18.000 BTUs) a R$ 1.200,00 (24.000 BTUs, loja ou sala grande). Inclui suporte e até 3 m de tubulação."},
    {"tipo":"preco", "titulo":"Limpeza e higienização de split", "conteudo":"R$ 160,00 por aparelho. A partir de 3 aparelhos no mesmo endereço, R$ 140,00 cada."},
    {"tipo":"preco", "titulo":"Recarga de gás do ar-condicionado", "conteudo":"De R$ 250,00 a R$ 350,00, conforme o gás e a potência. Antes da recarga é feito teste de vazamento."},
    {"tipo":"preco", "titulo":"Visita técnica e diagnóstico", "conteudo":"R$ 80,00. O valor é abatido do serviço se o cliente fechar em até 7 dias."},
    {"tipo":"preco", "titulo":"Serviços elétricos por ponto", "conteudo":"Tomada ou interruptor: R$ 60,00 por ponto. Tomada 20A com circuito novo: R$ 170,00 por ponto. Troca de disjuntor: R$ 50,00 cada, mais a peça."},
    {"tipo":"preco", "titulo":"Conserto de geladeira, freezer e máquina de lavar", "conteudo":"Diagnóstico de R$ 80,00 mais peças. Mão de obra entre R$ 150,00 e R$ 300,00. Troca de compressor a partir de R$ 900,00."},
    {"tipo":"preco", "titulo":"Contrato mensal de condomínio", "conteudo":"Manutenção preventiva das áreas comuns por R$ 900,00 ao mês, uma visita mensal. Chamado extra com 20% de desconto."},

    {"tipo":"faq", "titulo":"Atende aos domingos e feriados?", "conteudo":"Não. Só em emergência elétrica de cliente com contrato, com acréscimo de 50%."},
    {"tipo":"faq", "titulo":"Atende fora de Goiânia?", "conteudo":"Sim, em Aparecida de Goiânia e Senador Canedo, com taxa de deslocamento de R$ 40,00."},
    {"tipo":"faq", "titulo":"Quais formas de pagamento aceita?", "conteudo":"Pix, dinheiro e cartão. Parcelamento em até 3 vezes no cartão para serviços acima de R$ 600,00."},
    {"tipo":"faq", "titulo":"Precisa ter alguém no local?", "conteudo":"Sim, um adulto precisa estar presente do início ao fim do serviço."},
    {"tipo":"faq", "titulo":"Quanto tempo leva uma instalação de split?", "conteudo":"De 3 a 4 horas para um aparelho. Dois aparelhos no mesmo endereço, um dia inteiro."},
    {"tipo":"faq", "titulo":"O material está incluso?", "conteudo":"Suporte e até 3 m de tubulação estão inclusos na instalação. Peças de conserto são cobradas à parte, com nota da loja."},
    {"tipo":"faq", "titulo":"Faz orçamento pelo WhatsApp?", "conteudo":"Faz, com fotos do local e do aparelho. Se precisar ver de perto, marca a visita técnica."},

    {"tipo":"politica", "titulo":"Garantia", "conteudo":"Garantia de 90 dias na mão de obra. Peças seguem a garantia do fabricante. A garantia não cobre mau uso nem intervenção de outro técnico."},
    {"tipo":"politica", "titulo":"Sinal", "conteudo":"Serviços acima de R$ 500,00 pedem sinal de 50% no fechamento, por Pix. O restante é pago na conclusão."},
    {"tipo":"politica", "titulo":"Cancelamento e remarcação", "conteudo":"Remarcar ou cancelar com 24 horas de antecedência não custa nada. Visita perdida sem aviso cobra a visita técnica de R$ 80,00."},
    {"tipo":"politica", "titulo":"Horário de atendimento", "conteudo":"Segunda a sexta, das 8h às 18h. Sábado, das 8h às 12h. Domingo não atende."},
    {"tipo":"politica", "titulo":"Pagamento em atraso", "conteudo":"Depois de 5 dias do vencimento, manda um lembrete educado. Não cobra juros de cliente antigo; cliente novo só volta a ser atendido depois de quitar."},

    {"tipo":"nota_cliente", "cli":"ana", "titulo":"Acesso e preferências", "conteudo":"Apartamento 802, interfone 802. Prefere atendimento de manhã. Tem um gato, fechar a porta da varanda."},
    {"tipo":"nota_cliente", "cli":"beto", "titulo":"Acesso e preferências", "conteudo":"Casa com portão azul. Paga sempre por Pix no mesmo dia. Gosta de receber foto do antes e depois."},
    {"tipo":"nota_cliente", "cli":"carla", "titulo":"Acesso e preferências", "conteudo":"Quadro de energia fica na garagem. Pediu para avisar 1 hora antes de chegar."},
    {"tipo":"nota_cliente", "cli":"condo", "titulo":"Acesso e preferências", "conteudo":"Falar com a síndica pelo WhatsApp do condomínio. Entrada pela portaria de serviço, pedir crachá. Pagamento por Pix até o dia 10."},
    {"tipo":"nota_cliente", "cli":"diego", "titulo":"Acesso e preferências", "conteudo":"Trabalha de casa, qualquer horário serve. Prefere pagar no cartão."},
    {"tipo":"nota_cliente", "cli":"fabio", "titulo":"Acesso e preferências", "conteudo":"Prédio exige agendar o uso do elevador de serviço com a portaria um dia antes."},
    {"tipo":"nota_cliente", "cli":"gisele", "titulo":"Acesso e preferências", "conteudo":"Pagou sinal de 50%. Combinou o restante para a semana seguinte ao serviço."},
    {"tipo":"nota_cliente", "cli":"hugo", "titulo":"Acesso e preferências", "conteudo":"Costuma atrasar o pagamento alguns dias, mas sempre paga. Mandar lembrete gentil."},
    {"tipo":"nota_cliente", "cli":"iris", "titulo":"Acesso e preferências", "conteudo":"Casa de esquina, campainha não funciona: ligar ao chegar."},
    {"tipo":"nota_cliente", "cli":"marta", "titulo":"Acesso e preferências", "conteudo":"Geladeira duplex comprada há 6 anos. Prefere parcelar no cartão em 3 vezes."},
    {"tipo":"nota_cliente", "cli":"osvaldo", "titulo":"Acesso e preferências", "conteudo":"Loja de roupas, só pode instalar antes das 9h ou depois das 18h, ou no sábado à tarde."},
    {"tipo":"nota_cliente", "cli":"paula", "titulo":"Acesso e preferências", "conteudo":"Mora com a mãe idosa. Pediu para evitar desligar a energia por mais de 1 hora."},
    {"tipo":"nota_cliente", "cli":"renato", "titulo":"Acesso e preferências", "conteudo":"Comparando com outro orçamento. Disse que decide até o fim do mês."},
    {"tipo":"nota_cliente", "cli":"sueli", "titulo":"Acesso e preferências", "conteudo":"Freezer da sorveteria dela. Urgente: perde mercadoria se demorar."},

    {"tipo":"atendimento", "cli":"ana", "titulo":"Instalação do split da sala", "conteudo":"Tubulação passou pela parede da varanda e o dreno foi ligado no ralo. Ela quer o quarto no mesmo padrão."},
    {"tipo":"atendimento", "cli":"condo", "titulo":"Manutenção de outubro", "conteudo":"Trocados 2 disjuntores do salão de festas e 6 lâmpadas do hall. Reatores da garagem ficaram para a visita seguinte."},
    {"tipo":"atendimento", "cli":"diego", "titulo":"Conserto da geladeira", "conteudo":"Termostato trocado. Orientado a não encostar a geladeira na parede. Chamou de novo para um ar-condicionado portátil, mas desistiu."},
    {"tipo":"atendimento", "cli":"fabio", "titulo":"Instalação dos dois splits", "conteudo":"Pagou metade no Pix no fechamento e metade no cartão na entrega. Ficou de indicar o vizinho."},
    {"tipo":"atendimento", "cli":"gisele", "titulo":"Recarga de gás", "conteudo":"Vazamento pequeno na conexão da evaporadora, corrigido antes da recarga. Capacitor trocado."},
    {"tipo":"atendimento", "cli":"hugo", "titulo":"Fiação da cozinha", "conteudo":"Fiação antiga de 1,5 mm no circuito do micro-ondas, trocada por 2,5 mm. Recomendado revisar o resto da casa."},
    {"tipo":"atendimento", "cli":"beto", "titulo":"Limpeza dos splits", "conteudo":"Filtros muito sujos. Sugerido fazer limpeza a cada 6 meses."}
  ]$j$;
begin
  select id into v_user from public.users where lower(email) = lower('<EMAIL_DO_USUARIO>');
  if v_user is null then
    raise exception 'Cadastre o usuário em /setup antes de rodar o seed';
  end if;

  select id into v_mei from public.mei_salvar(v_user, jsonb_build_object(
    'nome', 'Lima Reparos e Climatização',
    'atividade', 'técnico de refrigeração e eletricista',
    'cidade', 'Goiânia',
    'telefone', '62 90000-0000',
    'chave_pix', 'pix@lima-reparos.exemplo'));

  -- Clientes: cliente_salvar acha pelo WhatsApp, então rodar de novo não duplica.
  for r in select * from jsonb_to_recordset(v_clientes)
    as x(k text, nome text, whatsapp text, endereco text, observacoes text)
  loop
    select id into v_id from public.cliente_salvar(v_mei, jsonb_strip_nulls(jsonb_build_object(
      'nome', r.nome, 'whatsapp', r.whatsapp, 'endereco', r.endereco, 'observacoes', r.observacoes)));
    v_cli := v_cli || jsonb_build_object(r.k, v_id);
  end loop;

  -- Serviços, na ordem da lista (o número sai em sequência).
  for r in select * from jsonb_to_recordset(v_servicos)
    as x(cli text, descr text, valor numeric, forma text, cenario text, d int, h int, orc boolean,
         contrato text, tarefa text, itens jsonb, msg text, msg_obj text, msg_status text)
  loop
    if exists (select 1 from public.servicos s where s.mei_id = v_mei and s.descricao = r.descr) then
      continue;
    end if;

    select c.* into v_cliente from public.clientes c where c.id = (v_cli->>r.cli)::uuid;
    v_contato := split_part(v_cliente.nome, ' ', 1);
    v_quando := ((public.hoje_sp() + coalesce(r.d, 0))::timestamp + make_interval(hours => coalesce(r.h, 12)))
                at time zone 'America/Sao_Paulo';
    v_com_orc := coalesce(r.orc, false)
                 or r.cenario in ('aguardando', 'orcado', 'orcado_descartado');
    v_fechado := r.cenario in ('pago', 'pago_2x', 'executado_parcial', 'executado_aberto', 'agendado')
                 or (r.cenario = 'confirmado' and not v_com_orc);

    -- Rascunho fica sem valor, local e forma (mostra os dados faltantes).
    select * into v_srv from public.servico_registrar(v_mei, jsonb_strip_nulls(jsonb_build_object(
      'cliente_id', v_cliente.id,
      'descricao', r.descr,
      'valor', r.valor,
      'forma_pagamento', r.forma,
      'local', case when r.cenario <> 'rascunho' then v_cliente.endereco end,
      'fechado', v_fechado)));

    -- Orçamento.
    if v_com_orc then
      select id into v_orc from public.orcamento_gerar(v_mei, v_srv.id, r.itens, 7);
      if r.cenario = 'orcado_descartado' then
        perform public.item_decidir(v_mei, 'orcamento', v_orc, 'descartar', v_user);
      elsif r.cenario <> 'orcado' then
        perform public.item_decidir(v_mei, 'orcamento', v_orc, 'aprovar', v_user);
      end if;
    end if;

    -- Proposta enviada: aguardando resposta desde o dia `d`.
    if r.cenario = 'aguardando' then
      select id into v_msg from public.mensagem_rascunhar(v_mei, jsonb_build_object(
        'canal', 'whatsapp', 'objetivo', 'envio_orcamento', 'servico_id', v_srv.id,
        'conteudo', format('Oi, %s! Segue o orçamento #%s de %s, no valor de R$ %s. Qualquer dúvida, é só chamar.',
          v_contato, lpad(v_srv.numero::text, 3, '0'), lower(left(r.descr, 1)) || substr(r.descr, 2),
          replace(to_char(r.valor, 'FM999990.00'), '.', ','))));
      perform public.item_decidir(v_mei, 'mensagem', v_msg, 'aprovar', v_user);
      perform public.mensagem_marcar_enviada(v_mei, v_msg);
      update public.orcamentos set enviado_em = v_quando where id = v_orc and mei_id = v_mei;
      update public.mensagens set enviado_em = v_quando where id = v_msg and mei_id = v_mei;

      if r.tarefa is not null then
        perform public.tarefas_gerar_followups(3, v_mei);
        select t.id into v_tar from public.tarefas t
        where t.servico_id = v_srv.id and t.mei_id = v_mei and t.status = 'aberta';
        if r.tarefa = 'ignorada' then
          perform public.tarefa_fechar(v_mei, v_tar, 'ignorada');
        elsif r.tarefa in ('feita', 'lembrete_rascunho') then
          select id into v_msg from public.mensagem_rascunhar(v_mei, jsonb_build_object(
            'canal', 'whatsapp', 'objetivo', 'lembrete', 'servico_id', v_srv.id, 'tarefa_id', v_tar,
            'conteudo', format('Oi, %s! Passando para saber se conseguiu ver o orçamento #%s. Posso reservar um horário para você?',
              v_contato, lpad(v_srv.numero::text, 3, '0'))));
          if r.tarefa = 'feita' then
            perform public.item_decidir(v_mei, 'mensagem', v_msg, 'aprovar', v_user);
            perform public.mensagem_marcar_enviada(v_mei, v_msg);
          end if;
        end if;
      end if;
    end if;

    if r.cenario = 'confirmado' and v_com_orc then
      perform public.servico_mudar_status(v_mei, v_srv.id, 'confirmado');
    end if;

    -- Minuta no formato do template (src/lib/documentos/contrato.ts), com o aviso na 1ª linha.
    if r.contrato is not null then
      select id into v_ctr from public.contrato_salvar(v_mei, v_srv.id, concat_ws(E'\n',
        'Minuta gerada automaticamente. Revise antes de usar; não substitui orientação jurídica.',
        '',
        'CONTRATO DE PRESTAÇÃO DE SERVIÇO',
        '',
        'CONTRATADO: Lima Reparos e Climatização, atividade de técnico de refrigeração e eletricista, telefone (62) 90000-0000, com sede em Goiânia.',
        format('CONTRATANTE: %s, WhatsApp (62) %s, residente em %s.', v_cliente.nome,
          substr(v_cliente.whatsapp, 3, 5) || '-' || substr(v_cliente.whatsapp, 8), v_cliente.endereco),
        '',
        format('CLÁUSULA 1ª (DO OBJETO): O CONTRATADO prestará ao CONTRATANTE o serviço de %s, no seguinte local: %s.',
          r.descr, v_cliente.endereco),
        '',
        format('CLÁUSULA 2ª (DO PREÇO E DO PAGAMENTO): Pelo serviço, o CONTRATANTE pagará ao CONTRATADO o valor total de R$ %s, na seguinte forma de pagamento: %s.',
          replace(to_char(r.valor, 'FM999990.00'), '.', ','), r.forma),
        '',
        'CLÁUSULA 3ª (DA GARANTIA): A mão de obra tem garantia de 90 dias.',
        '',
        'CLÁUSULA 4ª (DO FORO): Fica eleito o foro da comarca de Goiânia para resolver qualquer questão sobre este contrato.'));
      if r.contrato = 'aprovado' then
        perform public.item_decidir(v_mei, 'contrato', v_ctr, 'aprovar', v_user);
      elsif r.contrato = 'descartado' then
        perform public.item_decidir(v_mei, 'contrato', v_ctr, 'descartar', v_user);
      end if;
    end if;

    -- Agenda e execução.
    if r.cenario in ('pago', 'pago_2x', 'executado_parcial', 'executado_aberto', 'agendado') then
      perform public.servico_agendar(v_mei, v_srv.id, v_quando, null);
    end if;
    if r.cenario in ('pago', 'pago_2x', 'executado_parcial', 'executado_aberto') then
      perform public.servico_mudar_status(v_mei, v_srv.id, 'executado');
    end if;

    -- Pagamentos.
    if r.cenario = 'pago' then
      perform public.pagamento_registrar(v_mei, v_srv.id, r.valor, r.forma);
    elsif r.cenario = 'pago_2x' then
      perform public.pagamento_registrar(v_mei, v_srv.id, r.valor / 2, 'pix');
      perform public.pagamento_registrar(v_mei, v_srv.id, r.valor / 2, 'cartao');
    elsif r.cenario = 'executado_parcial' then
      perform public.pagamento_registrar(v_mei, v_srv.id, r.valor / 2, r.forma);
    end if;
    update public.pagamentos set criado_em = v_quando + interval '3 hours'
    where servico_id = v_srv.id and mei_id = v_mei;

    -- Mensagem a mais.
    if r.msg is not null then
      select id into v_msg from public.mensagem_rascunhar(v_mei, jsonb_build_object(
        'canal', 'whatsapp', 'objetivo', r.msg_obj, 'servico_id', v_srv.id, 'conteudo', r.msg));
      if r.msg_status = 'aprovado' then
        perform public.item_decidir(v_mei, 'mensagem', v_msg, 'aprovar', v_user);
      elsif r.msg_status = 'descartado' then
        perform public.item_decidir(v_mei, 'mensagem', v_msg, 'descartar', v_user);
      end if;
    end if;

    if r.cenario = 'cancelado' then
      perform public.servico_mudar_status(v_mei, v_srv.id, 'cancelado');
    end if;

    -- Histórico: o serviço nasceu dias antes da agenda ou do envio.
    update public.servicos
    set criado_em = least(v_quando, now()) - interval '6 days'
    where id = v_srv.id and mei_id = v_mei;
  end loop;

  -- Abre tarefa para proposta parada que ainda não tem (não duplica).
  perform public.tarefas_gerar_followups(3, v_mei);

  -- Posts de Instagram (sem cliente).
  if not exists (select 1 from public.mensagens m where m.mei_id = v_mei and m.objetivo = 'post') then
    select id into v_msg from public.mensagem_rascunhar(v_mei, jsonb_build_object(
      'canal', 'instagram', 'objetivo', 'post',
      'conteudo', 'Calor chegando! Limpeza e higienização de split a partir de R$ 140,00 por aparelho. Agende pelo WhatsApp.'));
    perform public.item_decidir(v_mei, 'mensagem', v_msg, 'aprovar', v_user);
    perform public.mensagem_rascunhar(v_mei, jsonb_build_object(
      'canal', 'instagram', 'objetivo', 'post',
      'conteudo', 'Antes e depois: dois splits instalados num apartamento no Setor Pedro Ludovico, tubulação embutida e acabamento limpo.'));
  end if;

  -- Memórias do negócio (memoria_salvar não duplica).
  perform public.memoria_salvar(v_mei, f) from unnest(array[
    'Cobra sinal de 50% em serviço acima de R$ 500.',
    'Não atende aos domingos.',
    'Garantia de 90 dias na mão de obra.',
    'Visita técnica custa R$ 80 e é abatida se o cliente fechar.',
    'Prefere receber por Pix.',
    'Atende Goiânia, Aparecida de Goiânia e Senador Canedo.'
  ]) as f;

  -- Base de conhecimento (conhecimento_salvar atualiza em vez de duplicar).
  for r in select * from jsonb_to_recordset(v_conhecimento) as x(tipo text, cli text, titulo text, conteudo text)
  loop
    perform public.conhecimento_salvar(v_mei, jsonb_strip_nulls(jsonb_build_object(
      'tipo', r.tipo, 'cliente_id', v_cli->>r.cli, 'titulo', r.titulo, 'conteudo', r.conteudo)));
  end loop;
end
$demo$;
