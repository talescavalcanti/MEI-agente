# MEIagente — contexto do desenvolvimento

Atualizado em 13/11/2026 pelo orquestrador (`orq MEIagente`). Leia junto com o plano
[`plans/2026-11-12-mei-agente-mvp.md`](plans/2026-11-12-mei-agente-mvp.md) (fonte da verdade das tarefas)
e o [`AGENTS.md`](../../AGENTS.md) (fluxo de git). Este arquivo é o resumo para retomar o trabalho numa sessão nova.

## 1. Estado das tarefas

| Task | Estado | Onde |
|---|---|---|
| T1 Fundação | concluída | PR #2 |
| T2 Banco de teste (PGlite) | concluída | PR #1 |
| T3 MEI e clientes | concluída | PR #3 |
| T4 Serviços, agenda, pagamentos | concluída | PR #6 |
| T5 Orçamento, contrato, mensagem, aprovação | concluída | PR #8 |
| T6 Pendências (propostas paradas) | concluída | PR #9 |
| T7 Documentos em TS | concluída | PR #4 |
| T8 Ferramentas do agente (16) | concluída | PR #12 |
| T9 Laço do agente, conversas, auditoria, limite | concluída | PR #13 |
| T10 Prompt, contexto, `llm.ts`, smoke | concluída, **smoke real pendente** | PRs #11 e #15 |
| T11 Rota `/api/chat` | concluída | branch `feat/t11-chat`, merge direto em `developer` (ff2fd5b, autor Pedro, sem PR) |
| T12 Primeiro acesso e Meu negócio | concluída | PR #5 |
| T13 Tela do agente | parte A (cartões e actions) em `developer` (PR #14); **parte B (page, Chat, ndjson) está só em `main`** (PR #18, ver §3) | |
| T14 Telas de consulta e impressão | concluída; conferência visual pendente | PR #17 |
| T15 Proatividade (cron e Início) | **não começada** | |
| T16 Demo, README, deploy | seed, `smoke.sh` e README §14 feitos (PR #16); ensaio e deploy pendentes | |

Outros PRs: #7 (tira chave do `.env.example`), #10 (remove `APP_URL`).

Verificação do `developer` em 561c623 (antes da T11): `npm test` 275/275 (numa das 3 rodadas, 1 falha intermitente, provavelmente o teste de token, §4), `npm run lint` limpo, `npm run build` ok.

## 2. Decisões tomadas nesta sessão (todas registradas também no plano)

- **Modelo:** `AGENTE_MODELO=google/gemma-4-31B-it` na Featherless. A API de modelos da Featherless marca `tool_use: true`, mas a doc deles só garante tool calling para Kimi-K2 e Qwen 3. Contexto de **32k**. Se o smoke falhar, trocar para um Qwen 3.
- **Plano Featherless:** 4 unidades simultâneas; modelo de 31B gasta 2, então só 2 pedidos ao mesmo tempo (429 traduzido para português no `llm.ts`).
- **Sem `APP_URL`:** removido do código e do `.env.example` (PR #10) para rodar localmente. Volta no deploy se precisar.
- **Tipos do agente:** `Llm`, `Chamada`, `Motivo`, `Evento` em `src/lib/agente/tipos.ts`; `Cartao`, `ResultadoFerramenta` em `ferramentas/executar.ts`; `Ferramenta`, `FERRAMENTAS` em `ferramentas/definicoes.ts`.
- **Listagens das telas** em `supabase/07-consultas.sql` (`cliente_listar`, `documentos_listar`, `mensagens_listar`).
- **`vitest.config.ts`** com `hookTimeout: 30_000` (PGlite lento com a suíte cheia).
- **Laço (T9):** cartões ficam na mensagem do assistente da volta que criou o item; `fim` sai mesmo depois de `erro` quando há conversa; limite diário checado antes de gravar; `conversa_anexar_varias` grava assistente + resultados numa transação.
- **`llm.ts` (T10):** dois modos (`criarLlm()` com streaming; `criarLlm({ streaming: false })` com `generateText`); histórico cortado em 40 mensagens / 40 mil caracteres, sempre numa mensagem do usuário; todo erro sai como `ErroLlm` em português.
- **Builders:** o dono pediu para **não distribuir mais tarefas** aos builders do Maestri (`builder meu chat`, `builder-02 meu chat`, `builder-03`, `builder-04`, `builder-05`). Todos terminaram o que tinham.

## 3. Problema aberto: tela do chat mergeada em `main`

O PR #18 (`feat/t13-chat`, autor Otávio Leão) foi mergeado com base **`main`**, não `developer`. Isso contraria o `AGENTS.md` (main só recebe de developer quando o dono pede). Situação:

- `origin/main` = developer até 6918526 + `58aad78 test: leitura de eventos ndjson do chat` + `90d27d0 feat: chat do agente com cartoes de aprovacao` (cria `src/app/painel/agente/{page.tsx,Chat.tsx,ndjson.ts}` e `tests/agente/ndjson.test.ts`).
- `origin/developer` **não** tem esses commits, e `main` não tem T11, T14 e T16.
- **Correção sugerida (decisão do dono):** levar a branch `feat/t13-chat` para `developer` (PR `feat/t13-chat → developer` ou merge de `origin/main` em `developer`), rodar `npm test`, `lint` e `build`, e depois decidir se `main` volta a ser só espelho de `developer`. Não fazer `push --force` nem reverter `main` sem o dono.

## 4. Pendências

**Código (sem dono no momento):**
1. Integrar a T13 parte B no `developer` (§3) e trocar a lista simples de Mensagens (T14) pelo componente `Cartao`.
2. **T15 Proatividade:** `api/cron/pendencias/route.ts`, `supabase/90-cron.sql` (placeholder `<CRON_SECRET>`), `src/lib/agente/pendencias.ts` (usar `depsDoMei` do `servidor.ts`), tela de Início (`painel/page.tsx` ainda é provisória).
3. **Minuta gravada em duas etapas** (T8): `gerar_minuta_contrato` grava provisória e refaz. Criar `servico_dados_documento(p_mei, p_servico)` no SQL e usar no executor.
4. **Teste intermitente** `tests/fundacao.test.ts` "token adulterado devolve null": trocar o último caractere base64url da assinatura só mexe em bits de padding (falha ~1 em 16). Corromper um caractere do meio.
5. Sem trava para dois turnos simultâneos na mesma conversa (duas abas).
6. Ensaio da demo e conferência visual das telas com o seed (T14 Step 3, T16 Step 4).

**Do dono:**
1. **Smoke real do modelo** (gasta crédito, frações de centavo): `JITI_ALIAS='{"@":"./src","server-only":"./tests/helpers/vazio.ts"}' npx jiti scripts/agente-smoke.ts --confirmo` e de novo com `--sem-streaming`. Roda contra PGlite, não toca no Supabase. Se o uso vier 0, ligar `includeUsage: true` no `llm.ts`.
2. **Rodar o SQL no Supabase** (nunca foi rodado em banco real): `supabase/01-auth.sql` a `07-consultas.sql` em ordem, depois `supabase/seed/demo.sql`. `90-cron.sql` só depois da T15.
3. **Deploy** na Vercel: só com ok do dono.

## 5. Ambiente local

- `.env.local` (não versionado) tem: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FEATHERLESS_API_KEY` (do dono), `AGENTE_MODELO=google/gemma-4-31B-it`, `CRON_SECRET` e `SESSION_SECRET` (gerados aleatórios em 13/11). `AGENTE_LIMITE_DIARIO_TOKENS` vazio (padrão 400000). `APP_URL` removido.
- Rodar: `npm install`, `npm run dev`, abrir `/setup`, depois `/painel/negocio` (passos completos no README §14).
- Suíte leva ~50 a 100 s; com vários `vitest` rodando ao mesmo tempo na máquina dá timeout (usar `--no-file-parallelism` nesse caso).

## 6. Integração com Meta (WhatsApp e Instagram) — em aberto

- O dono pediu para conectar o MCP da Meta (Meta Social Technologies, `https://mcp.facebook.com/devtools`) para criar o app e integrar Instagram e WhatsApp.
- Feito: `claude mcp add --transport http meta-devtools https://mcp.facebook.com/devtools` (escopo local deste projeto, em `~/.claude.json`). Estado: **precisa de autenticação** (`/mcp` → `meta-devtools` → Authenticate, com conta de desenvolvedor Meta, escopo Manage e, se for usar portfólio, `business_management`). Na sessão anterior o MCP não carregou; reiniciar o Claude Code e autenticar.
- **Perguntas em aberto para o dono, antes de criar o app:**
  1. Entra agora ou na fase 3? O README põe "integração real com API do WhatsApp e do Instagram" fora do MVP e na fase 3 ("envio com aprovação"); o plano tem a regra "nada de envio automático" e nenhuma ferramenta de envio. Integrar agora muda o plano e atrasa a demo.
  2. O que a integração faz: receber mensagens (webhook), enviar mensagens aprovadas pela WhatsApp Cloud API, publicar posts aprovados no Instagram, ou uma combinação.
  3. Nome do app e email de contato (o email só vai para a Meta com ok explícito do dono).
- Webhook exige URL HTTPS pública verificada pela Meta: local só com túnel (ngrok, Cloudflare Tunnel) ou depois do deploy.
- Criar app e criar Business Portfolio têm limite de 15 chamadas por dia cada, contando confirmações recusadas.

## 7. Como retomar

1. `git fetch origin && git pull --ff-only` em `developer` (nunca `checkout` na pasta principal; builders usam `../MEIagente-wt/<slug>`).
2. Ler este arquivo e o plano.
3. Resolver §3 (T13 parte B fora do `developer`) com o dono.
4. Autenticar o MCP da Meta e responder as perguntas de §6.
5. Seguir com T15 e as pendências de §4.
