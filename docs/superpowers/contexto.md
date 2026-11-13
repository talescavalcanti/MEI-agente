# MEIagente — contexto do desenvolvimento

Atualizado em 13/11/2026 (noite) pelo orquestrador (`orq MEIagente`); a landing page (§9) entrou nesta data. Leia junto com o plano
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
| T17 Nota fiscal assistida (outra equipe) | no `developer` | PR #32 (PRs #21, #22, #23, #25 mergeados antes em `feat/nota-fiscal`) |
| Criar conta | concluída | PRs #24 e #27 |
| Meta, parte 1 (receber mensagens) | concluída | PR #26 |
| Meta, parte 2 (enviar o que foi aprovado) | não começada | |
| Base de conhecimento + seed completo | concluída (17ª ferramenta `consultar_conhecimento`) | PR #29 |
| Landing page `/lp` | concluída e **em produção**; ajuste da segurança e do rodapé só no `developer` | PRs #44, #45 (→ `main`), #48. Ver §9 |

Verificação do `developer` em e94f613 (relatório do builder-02): `npm test` 381/381, `npm run lint` limpo, `npm run build` ok.
Na branch do PR #48 (13/11, noite): `npm test` 586/586 antes do merge do `developer`; depois dele, 585/586 com a falha intermitente da §4, item 8.

## 2. Decisões (registradas também no plano)

- **Modelo:** `AGENTE_MODELO=google/gemma-4-31B-it` na Featherless, contexto de 32k. Se o smoke falhar, trocar por um Qwen 3. Plano Featherless: só 2 pedidos simultâneos com modelo de 31B.
- **Desvios aprovados em 13/11** (seção própria no plano): integração com a Meta e base de conhecimento com seed sintético.
- **SQL nos testes:** `tests/helpers/banco.ts` carrega `supabase/[0-8]\d-*.sql` (01 a 89). `90-cron.sql` fica de fora. Há dois arquivos 09 (`09-meta.sql` e, na branch fiscal, `09-fiscal.sql`), independentes.
- **Builders do Maestri:** o dono voltou a liberar delegação em 13/11. builder-03 fez a Meta parte 1 (PR #26); builder-02 fez a base de conhecimento (PR #29).

## 3. `main` e `developer`

- `main` tinha recebido PRs direto (#18, #19) e o **revert do #19** (#20). Em 13/11 o dono autorizou levar `developer → main`: PR #31 (313f471). Como um merge comum reaplicaria o revert e apagaria 15 arquivos, a branch do PR partiu do `developer` com `git merge -s ours origin/main`. Resultado: **árvore de `main` idêntica à do `developer`**.
- Daqui em diante, `developer → main` é PR normal, sempre com ok do dono (merge em `main` publica em produção).
- Promoções seguintes: #34, #40, #43 e **#45** (13/11, a landing; `main` em 57a779b). Antes do #45 foi conferido com `git merge-tree --write-tree` que o resultado era idêntico à árvore do `developer` (o revert antigo de `main` não volta). Vale repetir essa conferência a cada promoção.
- **O PR #48 (segurança enxuta e logo no rodapé da landing) ainda não foi para `main`**: esperar o ok do dono.

## 4. Pendências

**Código:**
1. Meta parte 2: enviar pelo Direct/WhatsApp a mensagem que o MEI aprovou (clique, nunca automático); mostrar as mensagens recebidas no painel; tela para ligar a conta (hoje é por SQL).
2. Base de conhecimento: conferir com o modelo real se ele chama `consultar_conhecimento` na hora certa.
3. Integrar a T17 (nota fiscal) quando a equipe dela abrir PR para `developer`. Vai conflitar no fim de `definicoes.ts`, `executar.ts`, `prompt.ts`, `tipos.ts` e na lista de `tests/agente/ferramentas.test.ts`: são acréscimos dos dois lados, manter os dois (a lista do teste segue a ordem final do array).
4. Minuta gravada em duas etapas (T8): criar `servico_dados_documento(p_mei, p_servico)` no SQL e usar no executor.
5. Teste intermitente "token adulterado devolve null" (`tests/fundacao.test.ts`, ~1 em 16): corromper um caractere do meio da assinatura, não o último.
6. Sem trava para dois turnos simultâneos na mesma conversa.
7. Ensaio da demo e conferência visual das telas.
8. Teste intermitente "lista no máximo 30, as mais novas primeiro" (`tests/sql/agente.test.ts`, falhou 4 em 5 em 13/11): `memoria_listar` (`supabase/06-agente.sql:367`) ordena por `criado_em desc, id desc`; no PGlite as 32 memórias saem no mesmo instante e o desempate cai num uuid aleatório. Correção sugerida sem tocar no banco real: o teste grava as memórias com `criado_em` distintos. O dono autorizou mergear o #48 com essa falha (comentário no PR).
9. Landing: logo em SVG traçado de bitmap (degraus de 1 unidade); acima de 963px de largura a escada aparece nas curvas. Para usar a marca maior, redesenhar o SVG com curvas.

**Do dono:**
1. Smoke real do modelo: `JITI_ALIAS='{"@":"./src","server-only":"./tests/helpers/vazio.ts"}' npx jiti scripts/agente-smoke.ts --confirmo` e de novo com `--sem-streaming`.
2. Publicar o app na Meta (modo Live) depois que `/privacidade` e `/exclusao-de-dados` estiverem no ar (builder-03, `feat/paginas-legais`). Webhook já cadastrado pelo dono, campo `messages` assinado e @avoralabss.br inscrita no app (`POST /{ig-id}/subscribed_apps`, 13/11). DMs reais não chegam em `dev_mode`: a Meta exige app publicado.
3. `90-cron.sql` no Supabase, com `<APP_URL>` e `<CRON_SECRET>` trocados (sem commitar).
4. Revogar na Featherless a chave antiga `rc_0d88…7341`, que está no histórico do git (o repo agora é **público**). A chave atual é outra.

## 4b. Banco real (Supabase)

- Rodados: `01` a `10` (o `05` atual foi reaplicado em 13/11 pelo orquestrador: o banco estava com a `tarefas_gerar_followups(int)` antiga). Falta só o `90-cron.sql`.
- MEIs: "paulo eletricista" (conta do dono, com o Instagram @avoralabss.br ligado em `canais_conectados`), "Fotografo" (Victor) e **"Lima Reparos e Climatização"** (conta de demonstração do dono, seed `demo-completo.sql` rodado em 13/11: 20 clientes, 29 serviços nos 8 status, 15 mensagens, 4 tarefas, 6 memórias, 41 itens de conhecimento).
- O dono pôs `DATABASE_URL` (session pooler) no `.env.local`. A senha tem caracteres especiais: não usar `new URL()`/`connectionString`; separar pelo último `@`. Rodar SQL no banco real só com pedido do dono.

## 5. Deploy (Vercel)

- Projeto `mei-agente` (time talescavalcantis-projects), região `gru1`. Produção: **https://meiagente.talescavalcanti.dev** (também `mei-agente.vercel.app`).
- Em produção está `main` em 57a779b (PR #45), publicado pela integração com o GitHub cerca de 1 min depois do merge. Conferido em 13/11: `/lp` 200 com a página nova, `/api/health` 200, `/painel` sem sessão 307 para `/login`. Antes (313f471): `/cadastro` 200, `/api/meta/webhook` 403 sem token e 200 no handshake com o token.
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

## 9. Landing page (`/lp`)

Feita em 13/11 pelo orquestrador, a pedido do dono ("use o design system atual, o README para as informações e o acervo de componentes para não ficar com cara de IA").

- **Rota:** `src/app/lp/`, aberta no proxy com ou sem sessão (`OPEN_PAGES` em `src/proxy.ts`, teste em `tests/auth/proxy.test.ts`). `/` continua redirecionando para `/painel`; levar a landing para a raiz é mudança pequena, se o dono pedir.
- **Sistema visual:** o `LANDING-DESIGN-SYSTEM.md` do `meu-chat` (o documento de onde o painel herdou marca, sombras e easings), com a voz do MEIagente: Fustat nos títulos (500 no display) e a logo com o selo "IA". O selo inclinado (−19°) é o motivo da página: conta do trilho, ponto das listas, marca do agente na conversa. Desvios do documento, comentados no topo de `lp.css`: hero claro sobre o cinza do painel (não há fotografia própria) e corpo em Inter 400 (o 300 ficava com pouco contraste).
- **Conteúdo:** todo do README, em `conteudo.ts`. Nenhum número, depoimento ou cliente inventado; os únicos números são os do Sebrae, com fonte. Texto sem travessão.
- **Seções:** hero com a conversa do README §3 (`HeroDemo.tsx`, montada com as classes do `Cartao.tsx`; Aprovar, Editar e Descartar funcionam só no cliente, sem servidor) · problema com os números do Sebrae · cinco etapas no trilho · o que o agente faz (4 cartões em xadrez: documentos, propostas paradas, etapas do serviço, nota fiscal) · comparação (vira lista por pergunta no celular) · segurança · equipe · FAQ · fechamento e rodapé escuros com o logo grande.
- **Acervo:** componentes copiados de `projetos/componentes/web/src/library` para `src/app/lp/acervo/` (`process-rail`, `roller-number`, `reveal-accordion` e o `kit`); `LEIAME.md` lá dentro diz onde cada um aparece. Acréscimos marcados no código: prop `head` no trilho e estado inicial fechado no acordeão sem animação (antes, com `prefers-reduced-motion`, todas as respostas apareciam abertas). O `watermark-rise` foi usado no #44 e saiu no #48.
- **Movimento:** `gsap` e `lenis` entraram no `package.json`. `Motion.tsx` liga o Lenis e os reveals de scroll (`data-reveal`, `data-reveal-group`, `data-line-reveal`); o hero e a conversa animam por CSS, para não piscar antes da hidratação.
- **#48 (pedido do dono depois de ver no ar):** a segurança tinha informação demais (seis garantias e um log em mono com nomes de função). Ficou: uma frase, três linhas e o histórico do serviço da Maria em português (Agente ou Você, o que fez, rascunho ou aprovado). O rodapé trocou a marca em texto pelo logo em SVG (`MarcaRodape.tsx`), limitado a 60rem pela razão da §4, item 9.
- **Verificado:** Playwright com o Chrome instalado (`playwright-core` na pasta de rascunho da sessão, fora do projeto) em 1440, 768 e 390: sem rolagem horizontal, sem erro de console, fluxo da conversa de ponta a ponta. **Não verificado:** Safari, Firefox e leitor de tela de verdade.
