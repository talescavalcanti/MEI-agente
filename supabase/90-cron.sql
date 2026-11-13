-- ============================================================================
-- MEIagente — agendador de pendências (pg_cron + pg_net)
-- Rode no SQL Editor do Supabase depois dos outros arquivos, com o app já
-- publicado. Idempotente: rodar de novo só atualiza o job.
--
-- ANTES DE RODAR, troque os dois placeholders (e NÃO commite o resultado):
--   <APP_URL>     endereço público do app, sem barra no fim
--   <CRON_SECRET> o mesmo valor da variável CRON_SECRET do app
--
-- Todo dia às 11:00 UTC (08:00 em São Paulo) chama /api/cron/pendencias, que
-- abre as tarefas de follow-up das propostas paradas e pede ao agente um
-- lembrete (rascunho) para cada uma. Nada é enviado ao cliente.
--
-- Este arquivo não é carregado pelos testes (só `supabase/[0-8]*.sql`).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove a versão anterior do job, se houver.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mei-agente-pendencias') then
    perform cron.unschedule('mei-agente-pendencias');
  end if;
end;
$$;

select cron.schedule(
  'mei-agente-pendencias',
  '0 11 * * *',
  $job$
    select net.http_post(
      url := '<APP_URL>/api/cron/pendencias',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$
);

-- Conferir: select jobname, schedule, active from cron.job;
-- Últimas execuções: select * from cron.job_run_details order by start_time desc limit 5;
