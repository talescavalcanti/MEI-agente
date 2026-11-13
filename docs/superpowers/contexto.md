# MEIagente — contexto do desenvolvimento

Atualizado em 13/11/2026 (tarde) pelo orquestrador (`orq MEIagente`). Leia junto com o plano
[`plans/2026-11-12-mei-agente-mvp.md`](plans/2026-11-12-mei-agente-mvp.md) (fonte da verdade das tarefas)
e o [`AGENTS.md`](../../AGENTS.md) (fluxo de git). Este arquivo é o resumo para retomar o trabalho numa sessão nova.

## 1. Estado das tarefas

| Task | Estado | Onde |
|---|---|---|
| T1 a T9, T12 | concluídas | PRs #1 a #6, #8, #9, #12, #13 |
| T10 Prompt, contexto, `llm.ts`, smoke | concluída, **smoke real pendente** | PRs #11 e #15 |
| T11 Rota `/api/chat` | concluída | merge direto em `developer` (ff2fd5b) |
| T13 Tela do agente | concluída no `developer`: parte A no PR #14, parte B no PR #28 (cherry-pick do que o PR #18 pôs em `main`); verificação manual pendente | |
| T14 Telas de consulta e impressão | concluída; conferência visual pendente | PR #17 |
| T15 Proatividade (cron e Início) | concluída | `feat/t15-pendencias` (efaf0b8) |
| T16 Demo, README, deploy | seed, `smoke.sh`, README e **deploy feitos**; ensaio pendente | PR #16 e §5 |
| T17 Nota fiscal assistida (outra equipe) | em `feat/nota-fiscal` (PRs #21, #22, #23, #25 mergeados nela); **ainda não está no `developer`** | |
| Criar conta | concluída | PRs #24 e #27 |
| Meta, parte 1 (receber mensagens) | concluída | PR #26 |
| Meta, parte 2 (enviar o que foi aprovado) | não começada | |
| Base de conhecimento + seed completo | concluída (17ª ferramenta `consultar_conhecimento`) | PR #29 |

Verificação do `developer` em e94f613 (relatório do builder-02): `npm test` 381/381, `npm run lint` limpo, `npm run build` ok.

## 2. Decisões (registradas também no plano)

- **Modelo:** `AGENTE_MODELO=google/gemma-4-31B-it` na Featherless, contexto de 32k. Se o smoke falhar, trocar por um Qwen 3. Plano Featherless: só 2 pedidos simultâneos com modelo de 31B.
- **Desvios aprovados em 13/11** (seção própria no plano): integração com a Meta e base de conhecimento com seed sintético.
- **SQL nos testes:** `tests/helpers/banco.ts` carrega `supabase/[0-8]\d-*.sql` (01 a 89). `90-cron.sql` fica de fora. Há dois arquivos 09 (`09-meta.sql` e, na branch fiscal, `09-fiscal.sql`), independentes.
- **Builders do Maestri:** o dono voltou a liberar delegação em 13/11. builder-03 fez a Meta parte 1 (PR #26); builder-02 fez a base de conhecimento (PR #29).

## 3. `main` está bagunçada

- `main` recebeu PRs direto (#18 T13 parte B, #19 T11) e depois o **revert do #19** (#20, Pedro, 10:40). Hoje `main` = developer antigo + T13 parte B, **sem** T11, T14, T15, T16 e o resto.
- O que estava só em `main` (T13 parte B) já foi levado ao `developer` (PR #28). O revert **não** foi trazido.
- **Decisão do dono:** levar `developer → main` (PR), o que também publica em produção (ver §5). Não fazer `push --force` nem reset em `main`.

## 4. Pendências

**Código:**
1. Meta parte 2: enviar pelo Direct/WhatsApp a mensagem que o MEI aprovou (clique, nunca automático); mostrar as mensagens recebidas no painel; tela para ligar a conta (hoje é por SQL).
2. Base de conhecimento: conferir com o modelo real se ele chama `consultar_conhecimento` na hora certa.
3. Integrar a T17 (nota fiscal) quando a equipe dela abrir PR para `developer`. Vai conflitar no fim de `definicoes.ts`, `executar.ts`, `prompt.ts`, `tipos.ts` e na lista de `tests/agente/ferramentas.test.ts`: são acréscimos dos dois lados, manter os dois (a lista do teste segue a ordem final do array).
4. Minuta gravada em duas etapas (T8): criar `servico_dados_documento(p_mei, p_servico)` no SQL e usar no executor.
5. Teste intermitente "token adulterado devolve null" (`tests/fundacao.test.ts`, ~1 em 16): corromper um caractere do meio da assinatura, não o último.
6. Sem trava para dois turnos simultâneos na mesma conversa.
7. Ensaio da demo e conferência visual das telas.

**Do dono:**
1. Smoke real do modelo: `JITI_ALIAS='{"@":"./src","server-only":"./tests/helpers/vazio.ts"}' npx jiti scripts/agente-smoke.ts --confirmo` e de novo com `--sem-streaming`.
2. SQL no Supabase: `01` a `08` já rodados. Falta `09-meta.sql` e depois `select public.canal_conectar('<id do MEI>', 'instagram', '17841429113044909');`. Depois `10-conhecimento.sql` e, para a demo, `seed/demo-completo.sql` numa conta separada (criar por `/cadastro`; `/setup` só funciona com o banco vazio).
3. Autorizar o PR `developer → main` (deploy de produção).
4. Revogar na Featherless a chave antiga `rc_0d88…7341`, que está no histórico do git (o repo agora é **público**). A chave atual é outra.

## 5. Deploy (Vercel)

- Projeto `mei-agente` (time talescavalcantis-projects), região `gru1`. Produção: **https://meiagente.talescavalcanti.dev** (também `mei-agente.vercel.app`).
- Em produção está o commit `3a124e1` de `main` (antes do revert), publicado à mão pela CLI.
- O repositório GitHub está ligado ao projeto: merge em `main` vira deploy de produção; push em outra branch vira preview (atrás do login da Vercel).
- Variáveis em Production **e** Preview: as do `.env.local` mais `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_APP_ID`, `INSTAGRAM_ACCOUNT_ID`, `META_WEBHOOK_VERIFY_TOKEN`. Preview usa o mesmo Supabase e a mesma chave da Featherless que a produção.
- O repositório ficou público (13/11) para a Vercel aceitar deploy de commits de outros autores no plano Hobby.
- O classificador de permissões bloqueia `vercel env add` e `vercel deploy` vindos do agente: o dono roda com `!`.

## 6. Meta (Instagram e WhatsApp)

- MCP `meta-devtools` autenticado. App **MEIagente** (ID `1677711663821244`), email de contato aprovado pelo dono. Business Portfolio **MEIagente** (ID `29285011147797921`), app ligado a ele.
- Instagram: caso de uso "Gerenciar mensagens e conteúdo no Instagram", configuração **API setup with Unified login**. Redirect URL: `https://meiagente.talescavalcanti.dev/api/meta/instagram/callback` (rota ainda não existe). Conta escolhida pelo dono: **@avoralabss.br** (ID `17841429113044909`). Token de System User, válido, **sem expiração**, com `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `instagram_content_publish`.
- WhatsApp: **não adicionado** ainda (a confirmação do MCP expirou duas vezes; perguntar ao dono antes de tentar de novo). Depois falta o MCP WhatsApp Business Tools (`https://mcp.facebook.com/whatsapp_business_tools`) para número e modelos.
- Webhook: **não cadastrado**. Depois do deploy com o PR #26, cadastrar `https://meiagente.talescavalcanti.dev/api/meta/webhook` com o `META_WEBHOOK_VERIFY_TOKEN` e inscrever o campo `messages`. Em modo de desenvolvimento, só contas com papel no app geram eventos.
- Criar app e criar portfólio têm limite de 15 chamadas por dia cada.

## 7. Ambiente local

- `.env.local` (não versionado): as variáveis da §5. Nunca imprimir o conteúdo.
- Rodar: `npm install`, `npm run dev`, abrir `/setup` (ou `/cadastro`), depois `/painel/negocio` (README §14).
- Suíte leva ~50 a 100 s; com vários `vitest` ao mesmo tempo dá timeout (usar `--no-file-parallelism`).
- Worktree `../MEIagente-wt/deploy` (detached em `3a124e1`, ligado à Vercel) serve para deploy pela CLI.

## 8. Como retomar

1. `git fetch origin && git pull --ff-only` em `developer` (nunca `checkout` na pasta principal; builders usam `../MEIagente-wt/<slug>`).
2. Ler este arquivo e o plano.
3. Ver se a T17 (nota fiscal) chegou ao `developer`.
4. Com o dono: §4 "Do dono", na ordem.
