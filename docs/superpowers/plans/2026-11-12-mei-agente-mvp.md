# MEIagente MVP — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o ciclo completo do README §8 (cliente → serviço → orçamento → mensagem → minuta → pendências, tudo com aprovação humana) como um app web com chat, usando a fundação do `meu-chat`.

**Architecture:** App Next.js único. O chat chama um laço de agente no servidor (LLM com function calling, **neutro de provedor**); cada ferramenta é uma função fina que chama uma **função SQL** no Supabase, e é no SQL que moram as regras de negócio (máquina de estados, isolamento por MEI, aprovação). O modelo **não tem nenhuma ferramenta de envio**: ele só cria rascunhos; aprovar, editar e descartar são server actions disparadas por botão.

**Tech Stack:** Next.js 16.2 (App Router) · React 19 · Tailwind v4 · Supabase (Postgres, service key só no servidor) · `jose` (sessão) · Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) apontando para a **Featherless** · `zod` · Vitest + PGlite (testes).

**Spec:** [`README.md`](../../../README.md) (raiz do repo). Base de código: `/Users/talescavalcanti/Desktop/projetos/meu-chat` (somente leitura; nada é alterado lá).

## Global Constraints

- **Nada de envio automático.** Mensagem e documento só saem por ação manual do usuário (copiar / abrir `wa.me`). Não existe ferramenta `enviar_mensagem` no MVP (README §8).
- **Toda escrita no banco passa por função SQL** (`db.rpc`). Nenhum `insert/update` direto em tabela de domínio a partir do TypeScript.
- **Toda função SQL de domínio recebe `p_mei uuid` como 1º argumento e filtra por ele.** Id de outro MEI se comporta como id inexistente.
- **Violação de regra = `raise exception 'regra: <frase em português para o usuário>'`.** O prefixo `regra:` é o contrato com a camada de ferramentas.
- **Contrato do `Rpc`** (igual em teste e produção, definido na Task 2): função que devolve uma linha (`returns meis`) vira **objeto**; `setof`/`returns table` vira **lista**; `void` vira `null`; `numeric` vira `number`; erro é `Error` com a mensagem crua do Postgres (testar regra com `startsWith("regra:")`). O `Rpc` de produção (Task 11) lança `new Error(error.message)`.
- **SQL idempotente** (`create table if not exists`, `create or replace function`), RLS ligado e **sem políticas**, como no `meu-chat`.
- **Valores e datas de documento nunca vêm do texto do modelo**: orçamento e minuta são renderizados por template a partir do banco.
- **Minuta de contrato sempre carrega o aviso** "Minuta gerada automaticamente. Revise antes de usar; não substitui orientação jurídica." (README §9).
- **Fuso:** todo "hoje" é calculado em `America/Sao_Paulo`.
- **Sem API do Claude/Anthropic** (decisão do dono, 12/11). O provedor é a **Featherless** (API compatível com OpenAI, `https://api.featherless.ai/v1`): env `FEATHERLESS_API_KEY` e `AGENTE_MODELO` (id do modelo na Featherless, obrigatória, sem valor padrão no código). **Só `src/lib/agente/llm.ts` importa pacote de provedor**; o resto do código fala com a interface `Llm`.
- **O modelo escolhido precisa suportar function calling e streaming.** Nada no plano depende de recurso exclusivo de um provedor.
- **Histórico do agente é append-only:** as mensagens devolvidas pelo modelo em cada volta são gravadas e reenviadas **sem alteração**.
- **Segredo nunca versionado:** `supabase/90-cron.sql` vai com placeholder `<CRON_SECRET>`.
- **Fluxo de git e de entrega:** o `AGENTS.md` da raiz (branch por tarefa a partir de `developer`, worktree por agente, commit sem `Co-Authored-By`, push e merge automáticos por PR).
- **Next 16:** antes de escrever rota, proxy ou server action, ler o guia em `node_modules/next/dist/docs/` (regra do `AGENTS.md`, copiado do `meu-chat`).
- Texto de interface em português do Brasil, sem travessão.

## Review Focus

1. **Clique duplo ou decisão repetida num cartão** (aprovar duas vezes, aprovar depois de descartar): a 2ª chamada não muda nada e devolve o estado atual. → teste no Task 5.
2. **Mesmo cliente digitado de formas diferentes** (`62 9 9999-0000`, `+55 (62) 99999-0000`): vira um cadastro só. → teste no Task 3.
3. **Id inventado ou de outro MEI vindo do modelo:** a ferramenta devolve erro legível, nada é gravado, o turno continua. → testes nos Tasks 3 e 8.
4. **Falha no meio do turno** (limite de taxa, resposta barrada por filtro, corte por tamanho, teto de voltas): nunca fica chamada de ferramenta sem resultado gravado; a conversa segue utilizável na mensagem seguinte. → testes no Task 9.
5. **Mensagem com valor diferente do serviço** ("R$ 80" num serviço de R$ 800): o cartão mostra aviso antes de aprovar. → teste no Task 7.

---

## Decisões de adaptação (meu-chat → MEIagente)

| Peça do meu-chat | Destino |
|---|---|
| `src/lib/auth/*`, `src/proxy.ts`, `src/app/auth/actions.ts`, `login/`, `setup/`, `supabase/auth.sql`, `supabase/login-limite.sql` | **Copia**, tirando `ig_account_id`, conta ativa e os caminhos `/l/`, `/privacidade`, `/exclusao-de-dados` |
| `src/lib/env.ts`, `supabase.ts`, `tz.ts`, `datas.ts` | **Copia**; `env.ts` perde as variáveis `IG_*`/`WEBHOOK_*` e ganha as do agente |
| `src/app/components/*`, `globals.css`, `fonts/`, `painel/{PainelShell,PageHeader,EmptyModule,BlockError,Avatar,error}.tsx` | **Copia**; menu e marca novos |
| Padrão `estudio/scripts/lib/banco.mjs` (`rpcPglite`: SQL de verdade em PGlite) | **Porta** para `tests/helpers/banco.ts` |
| Padrão `pg_cron → /api/cron/* com CRON_SECRET` | **Reusa** para o agendador de pendências |
| Padrão `ai_requests`/aprovar roteiro | **Vira** o status `rascunho → aprovado/descartado` em orçamento, contrato e mensagem |
| `engine.ts`, `worker.ts`, `poller.ts`, `ig.ts`, `oauth*`, `hub-*`, `publicador*`, `estudio*`, `api/webhook`, `api/oauth`, telas de automação/hub/estúdio, pasta `estudio/` | **Não entra** |
| Regra "IA só pelo Claude Code do Mac, nunca a API" | **Invertida**: aqui o agente é o produto e roda por API de LLM (qualquer provedor, menos Claude) |

Desvios conscientes do README: (a) §13 propõe `src/agent`, `src/tools`…; fica `src/lib/agente/…` para seguir a convenção do Next/meu-chat; (b) `sugerir_post_instagram` vira `salvar_rascunho_post` (grava rascunho para o usuário copiar); (c) login já entra (vem pronto da base), com **um MEI por usuário**; multi-MEI por usuário continua fora.

## Estrutura de arquivos

```text
MEIagente/
├── AGENTS.md, CLAUDE.md, package.json, next.config.ts, tsconfig.json, vitest.config.ts, .env.example
├── supabase/
│   ├── 01-auth.sql            users + limite de login (do meu-chat)
│   ├── 02-clientes.sql        meis, clientes + funções
│   ├── 03-servicos.sql        servicos, agendamentos, pagamentos + máquina de estados
│   ├── 04-documentos.sql      orcamentos, contratos, mensagens + aprovação
│   ├── 05-pendencias.sql      tarefas + detecção de proposta parada
│   ├── 06-agente.sql          conversas, conversa_mensagens, agente_acoes, agente_uso, memorias
│   ├── 90-cron.sql            job do pg_cron (placeholder de segredo)
│   └── seed/demo.sql          dados de demonstração
├── src/lib/
│   ├── env.ts, supabase.ts, tz.ts, datas.ts, auth/*
│   ├── dominio/tipos.ts       tipos das linhas e dos retornos das funções SQL
│   ├── documentos/{formato,orcamento,contrato,divergencias}.ts
│   └── agente/
│       ├── ferramentas/{definicoes,executar}.ts
│       ├── prompt.ts, contexto.ts, llm.ts, loop.ts, conversas.ts, uso.ts
├── src/app/
│   ├── api/{chat,health}/route.ts, api/cron/pendencias/route.ts
│   ├── login/, setup/, auth/actions.ts, components/
│   └── painel/{layout,page}.tsx, agente/, clientes/, servicos/, agenda/, documentos/, mensagens/, negocio/
├── tests/{helpers/banco.ts, sql/*.test.ts, documentos/*.test.ts, agente/*.test.ts}
└── scripts/{smoke.sh, agente-smoke.ts}
```

## Ordem e paralelismo

A base (config, dependências, Vitest) já está em `developer`, então **T1 e T2 correm em paralelo**. `T2 → T3 → T4 → T5 → T6` em série (cada SQL depende do anterior). **T7** e **T12** podem correr em paralelo com T3–T6 depois do T1. `T8 → T9 → T10 → T11 → T13`. T14–T16 no fim.
**Linha de corte para a demo:** T1–T11 + T13 + T16. T14 e T15 podem sair enxutos.

---

### Task 1: Fundação copiada do meu-chat

**Files:**
- Create (cópia adaptada): tudo da 1ª, 2ª e 3ª linhas da tabela de adaptação
- Já existem em `developer` (não recriar): `package.json` com as dependências, `tsconfig.json`, `vitest.config.ts`, `tests/helpers/vazio.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts`, `vercel.json`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`
- Create: `.env.example`, `src/app/api/health/route.ts`, `src/app/painel/page.tsx` (provisória), `tests/fundacao.test.ts`

**Interfaces:**
- Produces: `db` (`@/lib/supabase`), `env` com `supabaseUrl, supabaseServiceKey, appUrl, cronSecret, sessionSecret, agenteModelo e featherlessApiKey (obrigatórias), limiteDiarioTokens (default 400000)`; `requireUser(): Promise<SessionUser>`, `requireUserApi()`, `PRIVATE_HEADERS`; `SessionUser = { id, email, name, role }`; cookie `mei_session`.

- [x] **Step 1:** Copiar os arquivos. Remover: `ig_account_id` (de `users.ts`, `dal.ts`, `auth.sql`), `getActiveAccount`/`canAccessAccount`/`requireAccountApi`, cookie de conta ativa, `assignAccount`, rotas abertas do proxy que não existem aqui. `SESSION_COOKIE = "mei_session"`. Trocar "meu-chat" por "MEIagente" em títulos e `Wordmark`.
- [x] **Step 2:** `.env.example` com `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `CRON_SECRET`, `SESSION_SECRET`, `FEATHERLESS_API_KEY`, `AGENTE_MODELO`, `AGENTE_LIMITE_DIARIO_TOKENS` (sem valores).
- [x] **Step 3:** `/api/health`: `200 {status:"ok"}` quando `select 1` em `users` responde, `503` quando não.
- [x] **Step 4:** `PainelShell` com o menu novo: Início `/painel`, Agente `/painel/agente`, Clientes, Serviços, Agenda, Documentos, Mensagens, Meu negócio `/painel/negocio`. Props reduzidas a `{ userName, navCounts?, children }`.
- [x] **Step 5:** `tests/fundacao.test.ts`: `signSession` + `verifySession` devolve o mesmo `sub`; token adulterado devolve `null`.
- [x] **Step 6:** Verificar. Run: `npm test && npm run lint && npm run build`. Expected: tudo passa; `grep -ri "ig_account\|instagram\|oauth" src/` não retorna nada.
- [x] **Step 7:** Commit `feat: fundacao do app a partir do meu-chat`.

### Task 2: Banco de teste (PGlite) e SQL de auth

**Files:**
- Create: `tests/helpers/banco.ts`, `supabase/01-auth.sql`, `tests/sql/auth.test.ts`

**Interfaces:**
- Produces: `abrirBancoTeste(): Promise<BancoTeste>` com `BancoTeste = { rpc: Rpc; q(sql, params?): Promise<any[]>; fechar(): Promise<void> }` e `type Rpc = (nome: string, args?: Record<string, unknown>) => Promise<unknown>` (exportado de `src/lib/dominio/tipos.ts`, usado por todo o resto). `criarMei(b, nome?): Promise<string>` devolve `mei_id`.

- [x] **Step 1:** Teste: abrir o banco duas vezes seguidas sobre a mesma instância não lança (idempotência); `users` existe com índice único em `lower(email)`.
- [x] **Step 2:** Run `npx vitest run tests/sql/auth.test.ts`. Expected: FAIL (helper não existe).
- [x] **Step 3:** Implementar `banco.ts` portando `rpcPglite` do meu-chat (chamada por argumentos nomeados, retorno no formato do supabase-js). Carrega todos os `supabase/[0-8]*.sql` em ordem alfabética. `01-auth.sql` = `auth.sql` + `login-limite.sql` sem `ig_account_id`.
- [x] **Step 4:** Run de novo. Expected: PASS.
- [x] **Step 5:** Commit `test: banco de teste em PGlite e sql de auth`.

### Task 3: MEI e clientes

**Files:**
- Create: `supabase/02-clientes.sql`, `tests/sql/clientes.test.ts`; Modify: `src/lib/dominio/tipos.ts`

**Interfaces:**
- Produces (SQL):
  - `meis(id, user_id unique → users, nome, atividade, cidade, telefone, chave_pix, criado_em)`; `mei_salvar(p_user uuid, p_dados jsonb) → meis`; `mei_do_usuario(p_user uuid) → meis`
  - `clientes(id, mei_id, nome, whatsapp, endereco, observacoes, criado_em, atualizado_em)`, único parcial `(mei_id, whatsapp)`
  - `cliente_salvar(p_mei, p_dados jsonb) → clientes` — `p_dados: {id?, nome?, whatsapp?, endereco?, observacoes?}`; sem `id`, casa pelo whatsapp normalizado e atualiza; campo ausente não apaga o existente
  - `cliente_buscar(p_mei, p_termo text) → setof clientes` — nome sem acento/caixa (contém) ou dígitos do telefone; máx. 10
  - `so_digitos(text) → text` (tira tudo que não é dígito e o `55` inicial quando sobram 12–13 dígitos)

- [x] **Step 1:** Testes:
  - `cliente_salvar` com `"62 9 9999-0000"` e depois `"+55 (62) 99999-0000"` → `count(*) = 1` e o nome é o da 2ª chamada.
  - `cliente_salvar` sem nome em cadastro novo → erro `regra: informe o nome do cliente`.
  - `cliente_buscar(mei_a, 'maria')` acha "María Souza"; `cliente_buscar(mei_b, 'maria')` devolve vazio.
  - `cliente_salvar(mei_b, {id: <cliente do mei_a>, nome: 'x'})` → erro `regra: cliente não encontrado` e a linha original intacta.
- [x] **Step 2:** Run. Expected: FAIL.
- [x] **Step 3:** Implementar o SQL.
- [x] **Step 4:** Run. Expected: PASS.
- [x] **Step 5:** Commit `feat: mei e clientes com regras no sql`.

### Task 4: Serviços, agenda, pagamentos e máquina de estados

**Files:**
- Create: `supabase/03-servicos.sql`, `tests/sql/servicos.test.ts`; Modify: `tipos.ts`

**Interfaces:**
- Produces:
  - `servicos(id, mei_id, cliente_id, numero int sequencial por MEI, descricao, valor numeric(12,2), data_prevista date, local, forma_pagamento check in ('pix','dinheiro','cartao','parcelado','outro'), status, criado_em, atualizado_em)`
  - Estados: `rascunho, orcado, aguardando_resposta, confirmado, agendado, executado, pago, cancelado`
  - `servico_registrar(p_mei, p_dados jsonb) → servicos` — `{cliente_id, descricao, valor?, data_prevista?, local?, forma_pagamento?, fechado?: bool}`; `fechado=true` nasce `confirmado`, senão `rascunho`
  - `servico_atualizar(p_mei, p_id, p_dados jsonb) → servicos` (mesmos campos, menos `cliente_id`; recusado em `pago`/`cancelado`)
  - `servico_faltantes(p_mei, p_id) → text[]` — subconjunto ordenado de `['cliente.whatsapp','cliente.endereco','servico.valor','servico.data_prevista','servico.forma_pagamento']` (`cliente.endereco` só falta se `servico.local` também for nulo)
  - `servico_mudar_status(p_mei, p_id, p_para text) → servicos` — transições manuais permitidas: `aguardando_resposta→confirmado`, `orcado→confirmado`, `agendado|confirmado→executado`, `qualquer não pago→cancelado`
  - `servico_agendar(p_mei, p_id, p_inicio timestamptz, p_local text) → agendamentos` — exige `confirmado` ou `agendado` (reagendar substitui); leva a `agendado`
  - `pagamento_registrar(p_mei, p_servico, p_valor, p_forma) → jsonb {pago_total, restante, status}` — soma ≥ valor leva a `pago`
  - `servico_listar(p_mei, p_status text default null) → setof` (com nome do cliente); `agenda_listar(p_mei, p_de date, p_ate date) → setof`

- [ ] **Step 1:** Testes:
  - numeração: dois serviços do mesmo MEI → `numero` 1 e 2; outro MEI começa em 1.
  - `servico_registrar` com `valor: -5` → `regra: o valor precisa ser maior que zero`.
  - cenário do README: `fechado=true`, valor 800, data sem cliente.whatsapp/endereço/pagamento → `servico_faltantes = ['cliente.whatsapp','cliente.endereco','servico.forma_pagamento']`; depois de completar → `[]`.
  - `servico_agendar` em serviço `rascunho` → `regra: o serviço ainda não foi confirmado pelo cliente`.
  - `servico_mudar_status(…, 'pago')` → `regra:` (pago só por pagamento).
  - pagamentos 300 + 500 em serviço de 800 → 1º devolve `restante: 500`, 2º leva a `pago`.
  - `servico_atualizar` em serviço `pago` → `regra:`.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: servicos, agenda, pagamentos e maquina de estados`.

### Task 5: Orçamento, contrato, mensagem e aprovação

**Files:**
- Create: `supabase/04-documentos.sql`, `tests/sql/documentos.test.ts`; Modify: `tipos.ts`

**Interfaces:**
- Produces:
  - `orcamentos(id, mei_id, servico_id unique, numero int, valor, itens jsonb, validade_dias int default 7, status, aprovado_em, aprovado_por, enviado_em, respondido_em)`
  - `contratos(id, mei_id, servico_id unique, minuta text, status, aprovado_em, aprovado_por)`
  - `mensagens(id, mei_id, cliente_id, servico_id, canal check in ('whatsapp','instagram'), objetivo check in ('confirmacao','envio_orcamento','lembrete','cobranca','post','outro'), conteudo, status, aprovado_em, aprovado_por, enviado_em, tarefa_id)`
  - Status de item: `rascunho, aprovado, descartado` (+ `enviado` só em mensagem)
  - `orcamento_gerar(p_mei, p_servico, p_itens jsonb default null, p_validade int default 7) → orcamentos` — exige `servico.valor`; sem itens, um item com a descrição e o valor; soma dos itens ≠ valor → `regra:`; refaz se `rascunho`, recusa se `aprovado`; serviço `rascunho` vira `orcado`, outros estados não mudam
  - `contrato_salvar(p_mei, p_servico, p_minuta text) → contratos` (mesma regra de refazer)
  - `mensagem_rascunhar(p_mei, p_dados jsonb) → mensagens` — `{canal, objetivo, conteudo, cliente_id?, servico_id?, tarefa_id?}`; conteúdo vazio ou > 2000 caracteres → `regra:`
  - `item_decidir(p_mei, p_tipo text, p_id uuid, p_decisao text, p_user uuid) → jsonb {tipo, id, status, mudou bool}` — `p_tipo ∈ orcamento|contrato|mensagem`, `p_decisao ∈ aprovar|descartar`; só age em `rascunho`
  - `item_editar(p_mei, p_tipo, p_id, p_dados jsonb) → jsonb` — só em `rascunho`; mensagem: `{conteudo}`; contrato: `{minuta}`; orçamento: `{itens, validade_dias}` (revalida a soma)
  - `mensagem_marcar_enviada(p_mei, p_id) → mensagens` — exige `aprovado`; se `objetivo='envio_orcamento'`: `orcamentos.enviado_em = now()` e serviço `orcado → aguardando_resposta`; se tiver `tarefa_id`: tarefa `feita`
  - `item_ver(p_mei, p_tipo, p_id) → jsonb` — `{ item, mei, cliente, servico, orcamento }`: o `item` mais os campos no formato `DadosDocumento` de `src/lib/documentos/tipos.ts` (para cartão e impressão)

- [ ] **Step 1:** Testes:
  - `orcamento_gerar` em serviço sem valor → `regra: defina o valor do serviço antes do orçamento`.
  - itens somando 700 em serviço de 800 → `regra:`.
  - **Review Focus 1:** `item_decidir(aprovar)` duas vezes → 1ª `mudou: true`, 2ª `mudou: false`, `aprovado_em` igual; `aprovar` depois de `descartar` → `status: 'descartado'`, `mudou: false`.
  - `item_editar` em item `aprovado` → `regra: este item já foi aprovado`.
  - `mensagem_marcar_enviada` em `rascunho` → `regra: aprove a mensagem antes de marcar como enviada`.
  - envio de orçamento: marcar enviada → `orcamentos.enviado_em` preenchido e serviço em `aguardando_resposta`.
  - `item_decidir` com id de outro MEI → `regra: item não encontrado`.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: orcamento, contrato, mensagem e aprovacao`.

### Task 6: Pendências (propostas paradas)

**Files:**
- Create: `supabase/05-pendencias.sql`, `tests/sql/pendencias.test.ts`

**Interfaces:**
- Produces:
  - `tarefas(id, mei_id, servico_id, tipo check in ('follow_up_orcamento'), vencimento date, status check in ('aberta','feita','ignorada'), criado_em)`, único parcial `(servico_id, tipo) where status='aberta'`
  - `propostas_pendentes(p_mei, p_dias int default 3) → table(servico_id, numero, descricao, valor, cliente_id, cliente_nome, cliente_whatsapp, enviado_em, dias_parado int, tarefa_id)` — serviço `aguardando_resposta` com `orcamentos.enviado_em <= now() - p_dias`
  - `tarefas_gerar_followups(p_dias int default 3) → table(mei_id, tarefa_id, servico_id)` — cria tarefa `aberta` para cada pendente sem tarefa aberta, de todos os MEIs; devolve só as novas
  - `tarefa_fechar(p_mei, p_id, p_status text) → tarefas`

- [ ] **Step 1:** Testes: orçamento enviado há 4 dias aparece com `dias_parado = 4`; enviado há 1 dia não aparece; `tarefas_gerar_followups` rodado duas vezes cria 1 tarefa; tarefa `ignorada` não é recriada no mesmo dia mas o serviço continua em `propostas_pendentes`; serviço `confirmado` não aparece.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: deteccao de propostas paradas`.

### Task 7: Documentos em TypeScript puro

**Files:**
- Create: `src/lib/documentos/{tipos,formato,orcamento,contrato,divergencias}.ts`, `tests/documentos/*.test.ts`

**Interfaces:**
- Consumes: nada de outras tarefas. Os tipos de entrada moram em `src/lib/documentos/tipos.ts` (não em `dominio/tipos.ts`): `DadosDocumento = { mei: { nome; atividade; cidade; telefone; chave_pix }, cliente: { nome; whatsapp; endereco }, servico: { numero; descricao; valor; data_prevista; local; forma_pagamento }, orcamento?: { numero; valor; itens: { descricao: string; valor: number }[]; validade_dias } }`. Tipos dos campos: `numero`, `valor` e `validade_dias` são `number`, `data_prevista` é `string` ISO `AAAA-MM-DD`, o resto é `string`; todo campo pode ser `null`, menos `mei.nome` e `servico.descricao`. A Task 5 faz o `item_ver` devolver exatamente este formato.
- Produces:
  - `moeda(valor: number): string` → `"R$ 800,00"`; `dataExtenso(iso: string): string` → `"sexta-feira, 20 de novembro de 2026"`; `telefone(digitos: string): string`
  - `renderOrcamento(d: DadosDocumento): { titulo: string; linhas: { descricao: string; valor: string }[]; total: string; validade: string; pagamento: string }`
  - `renderMinuta(d: DadosDocumento, clausulasExtras?: string[]): string` — texto com cláusulas fixas (objeto, preço e pagamento, prazo, obrigações, rescisão, foro = cidade do MEI), o aviso obrigatório no topo e `[A PREENCHER]` em todo dado ausente
  - `valoresDivergentes(texto: string, valor: number): string[]` — valores em reais citados no texto que diferem de `valor`

- [x] **Step 1:** Testes: `moeda(800) === "R$ 800,00"`; `renderMinuta` sem endereço contém `[A PREENCHER]` e começa com o aviso; cláusula extra aparece numerada depois das fixas; **Review Focus 5:** `valoresDivergentes("Valor combinado: R$ 80", 800)` → `["R$ 80,00"]`; `valoresDivergentes("R$ 800,00 no Pix", 800)` e `("R$800", 800)` → `[]`; texto sem valor → `[]`.
- [x] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [x] **Step 5:** Commit `feat: templates de orcamento e minuta`.

### Task 8: Ferramentas do agente

**Files:**
- Create: `src/lib/agente/ferramentas/{definicoes,executar}.ts`, `tests/agente/ferramentas.test.ts`

**Interfaces:**
- Consumes: `Rpc`; funções SQL dos Tasks 3–6; `renderMinuta`, `valoresDivergentes`.
- Produces:
  - `type Ferramenta = { nome: string; descricao: string; esquema: z.ZodObject<any> }`
  - `FERRAMENTAS: Ferramenta[]` — ordem fixa; o esquema zod é a única fonte da verdade (o `llm.ts` converte para o formato do provedor, o executor valida com ele)
  - `type Cartao = { tipo: "orcamento" | "contrato" | "mensagem"; id: string }`
  - `type ResultadoFerramenta = { conteudo: string; erro: boolean; cartao?: Cartao }`
  - `executarFerramenta(ctx: { rpc: Rpc; meiId: string; hoje: string }, nome: string, entrada: unknown): Promise<ResultadoFerramenta>`

| Ferramenta | Entrada | Chama | Cartão |
|---|---|---|---|
| `buscar_cliente` | `termo` | `cliente_buscar` | |
| `criar_ou_atualizar_cliente` | `id?, nome?, whatsapp?, endereco?, observacoes?` | `cliente_salvar` | |
| `registrar_servico` | `cliente_id, descricao, valor?, data_prevista?, local?, forma_pagamento?, fechado` | `servico_registrar` | |
| `atualizar_servico` | `servico_id` + campos | `servico_atualizar` | |
| `listar_dados_faltantes` | `servico_id` | `servico_faltantes` | |
| `listar_servicos` | `status?` | `servico_listar` | |
| `mudar_status_servico` | `servico_id, para` | `servico_mudar_status` | |
| `gerar_orcamento` | `servico_id, itens?, validade_dias?` | `orcamento_gerar` | orcamento |
| `gerar_minuta_contrato` | `servico_id, clausulas_extras?` | `item_ver` → `renderMinuta` → `contrato_salvar` | contrato |
| `redigir_mensagem` | `cliente_id, servico_id?, objetivo, conteudo, tarefa_id?` | `mensagem_rascunhar` | mensagem |
| `salvar_rascunho_post` | `conteudo` | `mensagem_rascunhar` (canal instagram, objetivo post) | mensagem |
| `agendar_servico` | `servico_id, data, hora, local?` | `servico_agendar` | |
| `consultar_agenda` | `de, ate` | `agenda_listar` | |
| `listar_propostas_pendentes` | `dias_sem_resposta?` | `propostas_pendentes` | |
| `registrar_pagamento` | `servico_id, valor, forma` | `pagamento_registrar` | |
| `salvar_memoria` | `fato` | `memoria_salvar` (Task 9) | |

Regras do executor: validar `entrada` com o `esquema` da ferramenta (falha → `erro: true`, conteúdo `{"entrada_invalida": <mensagens do zod>}`); exceção com prefixo `regra:` → `erro: true` com a frase; qualquer outra exceção → `erro: true`, `"erro interno, tente de novo"` e `console.error`; ferramenta desconhecida → `erro: true`. `conteudo` é sempre JSON em string. `redigir_mensagem` acrescenta `aviso_valores` quando `valoresDivergentes` não é vazio.

- [ ] **Step 1:** Testes (PGlite): cenário do README ponta a ponta só com `executarFerramenta` (criar cliente → registrar serviço fechado 800 → faltantes → completar → orçamento → minuta → mensagem) termina com 3 cartões e serviço `confirmado`; **Review Focus 3:** `gerar_orcamento` com `servico_id` aleatório → `erro: true`, texto contém "não encontrado", zero linhas em `orcamentos`; entrada sem campo obrigatório → `erro: true` com `entrada_invalida`; nome de ferramenta inexistente → `erro: true`; `FERRAMENTAS` não contém nenhuma com nome começando em `enviar`.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: ferramentas do agente`.

### Task 9: Laço do agente, conversas, auditoria e limite de uso

**Files:**
- Create: `supabase/06-agente.sql`, `src/lib/agente/{loop,conversas,uso}.ts`, `tests/agente/loop.test.ts`, `tests/helpers/llm-falso.ts`

**Interfaces:**
- Consumes: `executarFerramenta`, `FERRAMENTAS`, `Cartao`.
- Produces (SQL): `conversas(id, mei_id, titulo, origem check in ('chat','agendador'), criado_em)`; `conversa_mensagens(id bigserial, conversa_id, role, content jsonb, cartoes jsonb, criado_em)` (`content` = a `ModelMessage` inteira, como veio); `agente_acoes(id, mei_id, conversa_id, tipo check in ('ferramenta','decisao'), nome, entrada jsonb, saida jsonb, erro bool, user_id, criado_em)`; `agente_uso(mei_id, dia date, tokens_entrada bigint, tokens_saida bigint, pk(mei_id, dia))`; `memorias(id, mei_id, fato, criado_em)`. Funções: `conversa_criar(p_mei, p_origem, p_titulo)`, `conversa_anexar(p_mei, p_conversa, p_role, p_content jsonb, p_cartoes jsonb default null)`, `conversa_ler(p_mei, p_conversa)`, `conversa_listar(p_mei)`, `acao_registrar(...)`, `uso_somar(p_mei, p_entrada, p_saida) → agente_uso`, `uso_hoje(p_mei) → bigint`, `memoria_salvar(p_mei, p_fato)`, `memoria_listar(p_mei)` (máx. 30, mais novas primeiro). `item_decidir` do Task 5 passa a gravar `agente_acoes` tipo `decisao`.
- Produces (TS):
  - `type Chamada = { id: string; nome: string; entrada: unknown }`
  - `type Motivo = "fim" | "ferramentas" | "limite" | "filtro" | "outro"`
  - `interface Llm { turno(req: { system: string; mensagens: ModelMessage[]; ferramentas: Ferramenta[] }, aoTexto: (delta: string) => void): Promise<{ mensagens: ModelMessage[]; chamadas: Chamada[]; motivo: Motivo; uso: { entrada: number; saida: number } }>; resultado(itens: { id: string; nome: string; conteudo: string; erro: boolean }[]): ModelMessage }` — `ModelMessage` é o tipo de mensagem do AI SDK (importação só de tipo). `turno` devolve as mensagens novas do assistente; `resultado` monta a mensagem com os resultados das ferramentas. O laço nunca monta mensagem de provedor à mão.
  - `type Evento = { tipo: "texto"; delta: string } | { tipo: "ferramenta"; nome: string; erro: boolean } | { tipo: "cartao"; cartao: Cartao } | { tipo: "fim"; conversaId: string } | { tipo: "erro"; mensagem: string }`
  - `rodarTurno(deps: { rpc: Rpc; llm: Llm; meiId: string; hoje: string; system: string; limiteDiario: number }, entrada: { conversaId: string | null; texto: string; origem?: "chat" | "agendador" }, emitir: (e: Evento) => void): Promise<{ conversaId: string }>`
  - `MAX_VOLTAS = 8`

Comportamento: checa `uso_hoje >= limiteDiario` antes de chamar o modelo (emite `erro` "Você atingiu o limite de uso de hoje."); grava a mensagem do usuário; a cada volta chama `llm.turno`, soma uso; `fim` → grava as mensagens do assistente e emite `fim`; `ferramentas` → executa todas as chamadas, grava **na mesma operação** as mensagens do assistente e a mensagem de `llm.resultado(...)` com todos os resultados, registra `agente_acoes`, emite `ferramenta`/`cartao`; `filtro`, `limite`, `outro` ou estouro de `MAX_VOLTAS` → não executa ferramentas daquela volta, não grava a volta incompleta, emite `erro`. Os cartões do turno vão no `cartoes` da última mensagem do assistente.

- [ ] **Step 1:** Testes com `llmFalso(roteiro)`:
  - texto simples → 2 linhas em `conversa_mensagens`, evento `fim`.
  - chamada de `registrar_servico` → `fim`: 4 linhas (usuário, assistente, resultados, assistente), 1 linha em `agente_acoes`, uso somado das duas voltas.
  - duas chamadas na mesma volta → **uma** mensagem de resultados com as duas.
  - as mensagens devolvidas por `turno` na volta 1 chegam à volta 2 idênticas (`deepEqual`), inclusive partes que o laço não entende.
  - **Review Focus 4:** `motivo: "filtro"` com chamadas no retorno → nenhuma ferramenta executada, evento `erro`, e a conversa relida tem toda chamada pareada com resultado; modelo que pede ferramenta para sempre → para em 8 voltas com `erro`, histórico pareado; `llm.turno` que lança → evento `erro`, mensagem do usuário preservada, próxima chamada de `rodarTurno` na mesma conversa funciona.
  - uso do dia acima do limite → `llm.turno` não é chamado.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: laco do agente com historico, auditoria e limite`.

### Task 10: Cliente do modelo, prompt e contexto

**Files:**
- Create: `src/lib/agente/{llm,prompt,contexto}.ts`, `tests/agente/prompt.test.ts`, `scripts/agente-smoke.ts`

**Interfaces:**
- Consumes: `Llm`, `FERRAMENTAS`, `memoria_listar`, `mei_do_usuario`.
- Produces:
  - `criarLlm(): Llm` — uma chamada de `streamText` do AI SDK **por volta**, com as ferramentas declaradas **sem `execute`** (quem executa é o nosso laço, Task 9) e sem laço interno do SDK. Deltas de texto vão para `aoTexto`; `motivo` vem do `finishReason` (`stop→fim`, `tool-calls→ferramentas`, `length→limite`, `content-filter→filtro`, resto → `outro`); `uso` vem do `usage`. Limite de taxa e falha de rede são relançados com mensagem em português.
  - **Antes de escrever este arquivo:** carregar a skill `vercel:ai-sdk` (ou a documentação da versão instalada em `node_modules/ai`) e conferir os nomes exatos; a API do AI SDK muda entre majors. Provedor: `createOpenAICompatible({ name: "featherless", baseURL: "https://api.featherless.ai/v1", apiKey: env.featherlessApiKey })` e o modelo `env.agenteModelo` (ver "Provedor: Featherless").
  - `PROMPT_SISTEMA: string` — constante, **sem** data, nome do MEI ou qualquer valor variável (prefixo estável: aproveita cache automático onde o provedor oferece)
  - `montarSystem(): string` (= `PROMPT_SISTEMA`); `blocoContexto(mei: Mei, memorias: string[], hoje: string): string` — vai **prefixado ao texto do usuário** em `<contexto_do_negocio>…</contexto_do_negocio>`

Conteúdo do prompt (decidido aqui, redação livre): papel (assistente administrativo de MEI, tom direto e cordial, português do Brasil); ao receber um pedido, registrar o que já dá, conferir `listar_dados_faltantes` e perguntar tudo que falta **numa única mensagem**; buscar o cliente antes de criar; datas relativas resolvidas a partir de `hoje` do contexto e passadas como `AAAA-MM-DD`; nunca dizer que enviou algo: ele prepara rascunhos e o usuário decide nos cartões; não repetir no texto o conteúdo completo do que já está no cartão; minuta não é orientação jurídica; guardar com `salvar_memoria` preferências duradouras do negócio.

- [ ] **Step 1:** Testes: `PROMPT_SISTEMA` não contém dígitos de ano nem o padrão `\d{4}-\d{2}-\d{2}`; `blocoContexto` contém a data de hoje, a atividade do MEI e cada memória; duas chamadas de `montarSystem()` são idênticas.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** `scripts/agente-smoke.ts`: roda as duas falas do README §3 contra a API real e um PGlite, imprime ferramentas chamadas, cartões e uso de tokens. **Gasta crédito: só rodar com o ok do dono.** Expected: 3 cartões, serviço `confirmado`, nenhuma ferramenta com `entrada_invalida`. É também o teste de aceitação do modelo escolhido: se ele não fechar este cenário, trocar `AGENTE_MODELO`.
- [ ] **Step 6:** Commit `feat: cliente do modelo, prompt e contexto do negocio`.

### Task 11: Rota de chat com streaming

**Files:**
- Create: `src/app/api/chat/route.ts`, `src/lib/agente/servidor.ts`

**Interfaces:**
- Consumes: `requireUserApi`, `rodarTurno`, `criarLlm`, `montarSystem`, `blocoContexto`, `db`.
- Produces: `POST /api/chat` com corpo `{ conversaId: string | null, texto: string }` → `200 application/x-ndjson`, uma linha por `Evento`. `401` sem sessão; `400` texto vazio ou > 4000 caracteres; `409` usuário sem MEI. `runtime = "nodejs"`, `maxDuration = 120`, cabeçalhos `PRIVATE_HEADERS`. `prepararTurno(userId): Promise<{ deps, mei }>` em `servidor.ts` (reusado pelo cron do Task 15).

- [ ] **Step 1:** Implementar com `ReadableStream`; `rpc` = `(n, a) => db.rpc(n, a)` lançando o `error.message` do Supabase (preserva o prefixo `regra:`).
- [ ] **Step 2:** Verificar. Run: `npm run build` e, com `npm run dev`, `curl -N -X POST localhost:3000/api/chat -d '{"conversaId":null,"texto":"oi"}'`. Expected: `401` sem cookie.
- [ ] **Step 3:** Commit `feat: rota de chat com streaming`.

### Task 12: Primeiro acesso e "Meu negócio"

**Files:**
- Modify: `src/app/auth/actions.ts`, `src/app/setup/*`, `src/app/painel/layout.tsx`; Create: `src/app/painel/negocio/{page.tsx,NegocioForm.tsx,actions.ts}`, `src/lib/dominio/mei.ts`

**Interfaces:**
- Consumes: `mei_salvar`, `mei_do_usuario`.
- Produces: `requireMei(): Promise<{ user: SessionUser; mei: Mei }>` (redireciona para `/painel/negocio` se o usuário ainda não tem MEI); `salvarNegocio(prev, formData)`.

- [ ] **Step 1:** `/setup` cria o usuário e segue para `/painel/negocio`. Formulário: nome do negócio, atividade (texto livre com sugestões: eletricista, técnico de manutenção, fotógrafo), cidade, telefone, chave Pix (opcional).
- [ ] **Step 2:** Toda página do painel (menos `negocio`) começa com `requireMei()`.
- [ ] **Step 3:** Verificar à mão: setup → negócio → `/painel`. `npm run build` passa.
- [ ] **Step 4:** Commit `feat: primeiro acesso e cadastro do negocio`.

### Task 13: Tela do agente (chat e cartões de aprovação)

**Files:**
- Create: `src/app/painel/agente/{page.tsx,Chat.tsx,Cartao.tsx,EditarItem.tsx,actions.ts,ndjson.ts}`, `tests/agente/ndjson.test.ts`

**Interfaces:**
- Consumes: `POST /api/chat`, `Evento`, `Cartao`, `item_ver`, `item_decidir`, `item_editar`, `mensagem_marcar_enviada`, `conversa_ler`, `conversa_listar`, `renderOrcamento`, `valoresDivergentes`.
- Produces: `lerEventos(body: ReadableStream<Uint8Array>): AsyncGenerator<Evento>`; actions `decidirItem(tipo, id, decisao)`, `editarItem(tipo, id, dados)`, `marcarEnviada(id)`, `verItem(tipo, id)` — todas com `requireMei()` e erro `regra:` devolvido como `{ erro: string }`.

Comportamento da tela: lista de conversas + "Nova conversa"; texto do assistente aparece em streaming; linha discreta por ferramenta ("Registrando serviço…"); cada cartão mostra o item com **[Aprovar] [Editar] [Descartar]**. Cartão de mensagem aprovada troca os botões por **[Copiar] [Abrir no WhatsApp]** (`https://wa.me/55<dígitos>?text=…`, só com whatsapp cadastrado) **[Marcar como enviada]**. Cartão de mensagem com `valoresDivergentes` não vazio mostra aviso âmbar com os valores. Cartão de contrato mostra o aviso jurídico e link "Ver documento". Recarregar a página reconstrói conversa e cartões a partir de `conversa_ler` (estado atual de cada item via `verItem`).

- [ ] **Step 1:** Teste de `lerEventos`: linha partida entre dois chunks é remontada; linha vazia é ignorada; JSON inválido vira `{tipo:"erro"}` sem lançar.
- [ ] **Step 2–4:** Run (FAIL) → implementar tudo → Run (PASS).
- [ ] **Step 5:** Verificação manual com o cenário do README §3: as duas falas produzem 3 cartões; aprovar a mensagem libera "Copiar"; clique duplo em Aprovar não duplica nada; F5 mantém conversa e estados.
- [ ] **Step 6:** Commit `feat: chat do agente com cartoes de aprovacao`.

### Task 14: Telas de consulta

**Files:**
- Create: `src/app/painel/{clientes,servicos,agenda,documentos,mensagens}/page.tsx`, `src/app/painel/documentos/[tipo]/[id]/page.tsx`

**Interfaces:**
- Consumes: `cliente_buscar`, `servico_listar`, `agenda_listar`, `item_ver`, `renderOrcamento`; novas funções de leitura em `04-documentos.sql`: `documentos_listar(p_mei)`, `mensagens_listar(p_mei, p_status text default null)`.

- [ ] **Step 1:** Listas somente leitura, cada uma com `PageHeader` e `EmptyModule` no vazio ("Nenhum cliente ainda. Conte um serviço ao agente e ele cadastra para você."). Serviços com filtro por estado (`Segmented`). Mensagens reaproveita `Cartao`.
- [ ] **Step 2:** `documentos/[tipo]/[id]`: página de impressão (orçamento renderizado ou minuta), `@media print` escondendo a casca, botão "Imprimir / salvar PDF". Item de outro MEI → `notFound()`.
- [ ] **Step 3:** `npm run build` e conferência visual das cinco telas com o seed.
- [ ] **Step 4:** Commit `feat: telas de consulta e impressao de documentos`.

### Task 15: Proatividade (agendador e Início)

**Files:**
- Create: `src/app/api/cron/pendencias/route.ts`, `supabase/90-cron.sql`, `src/app/painel/{page.tsx,Pendencias.tsx,actions.ts}`, `src/lib/agente/pendencias.ts`, `tests/agente/pendencias.test.ts`

**Interfaces:**
- Consumes: `tarefas_gerar_followups`, `propostas_pendentes`, `rodarTurno`, `tarefa_fechar`.
- Produces: `sugerirFollowups(deps, meiId): Promise<{ sugeridas: number }>` — para cada tarefa aberta sem mensagem ligada, roda `rodarTurno` com `origem: "agendador"` e o texto `Proposta parada: serviço #<n> (<cliente>, <descrição>, <valor>) sem resposta há <d> dias. Redija um lembrete curto e cordial com redigir_mensagem (objetivo lembrete, tarefa_id <id>).`; máximo 5 por execução. Rota `POST|GET /api/cron/pendencias` protegida por `CRON_SECRET` (mesmo `authorized()` do meu-chat). Action `verificarPendenciasAgora()` (mesma função, só para o MEI logado). Job `mei-agente-pendencias` `'0 11 * * *'` (08:00 em São Paulo).

- [ ] **Step 1:** Teste com LLM falso: uma proposta parada há 4 dias → 1 mensagem `rascunho` com `tarefa_id`; rodar de novo → continua 1; 7 propostas paradas → 5 sugeridas.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Início: "Hoje" (agendamentos do dia), "Esperando sua decisão" (rascunhos abertos, com `Cartao`), "Propostas paradas" (com **[Ver lembrete] [Ignorar]** e botão "Verificar agora"), atalho para o agente.
- [ ] **Step 6:** Commit `feat: acompanhamento de propostas paradas`.

### Task 16: Demo, README e deploy

**Files:**
- Create: `supabase/seed/demo.sql`, `scripts/smoke.sh`; Modify: `README.md` (§14 "Como rodar", status), `.env.example`

- [ ] **Step 1:** `demo.sql` (idempotente, recebe o email do usuário): MEI "Refrigeração Bueno" (técnico de manutenção, Goiânia); 5 clientes; serviço pago, serviço agendado para amanhã, e **o caso do README**: Carlos, troca de fiação, R$ 450, orçamento #009 enviado há 4 dias, `aguardando_resposta`.
- [ ] **Step 2:** `smoke.sh` (só GETs): `/api/health` ok; `/painel` sem sessão redireciona para `/login`; `/api/chat` sem sessão → 401; `/api/cron/pendencias` sem segredo → 401.
- [ ] **Step 3:** README §14 com os passos reais: criar projeto Supabase, rodar os SQL em ordem, `.env.local`, `npm install`, `npm run dev`, `/setup`, seed.
- [ ] **Step 4:** Ensaiar o roteiro de demo: (1) fala do README → cartões → aprovar e copiar; (2) "Verificar agora" → lembrete do Carlos; (3) "me dá uma ideia de post para essa semana" → rascunho de post.
- [ ] **Step 5:** Commit `docs: como rodar e dados de demonstracao`. Deploy na Vercel **só com o ok do dono**.

---

## Provedor: Featherless

Decidido pelo dono em 12/11. Pacotes `ai`, `@ai-sdk/openai-compatible` e `zod` já estão no `package.json`. Falta do dono: a `FEATHERLESS_API_KEY`. Isso só trava o **Step 5 do Task 10** (T1–T9 usam LLM falso).

**A conferir na documentação da Featherless no início do Task 10 (não verificado neste plano):**

1. Quais modelos aceitam function calling (`tools`) e se funciona junto com streaming. Se não funcionar com streaming, `turno` usa a chamada sem streaming e entrega o texto de uma vez em `aoTexto`; a interface `Llm` não muda.
2. A janela de contexto do modelo escolhido: prompt do sistema + 16 ferramentas + histórico precisam caber. Se for curta, encurtar as descrições das ferramentas e limitar o histórico reenviado às últimas N mensagens **inteiras** (nunca cortar entre chamada e resultado).
3. O limite de requisições simultâneas do plano contratado (afeta a demo com mais de um usuário e o cron do Task 15).

`AGENTE_MODELO` é escolhido pelo critério: passar no `scripts/agente-smoke.ts` (cenário do README §3) com chamadas de ferramenta válidas.

## Cobertura do README

| README | Onde |
|---|---|
| §8 Cadastro de cliente | T3, T8, T14 |
| §8 Serviço em linguagem natural | T4, T8, T9, T10 |
| §8 Geração de orçamento | T5, T7, T8 |
| §8 Rascunho de WhatsApp (copiar/colar) | T5, T8, T13 |
| §8 Minuta contratual | T5, T7, T8 |
| §8 Propostas pendentes e sugestão | T6, T15 |
| §8 Aprovação antes de ação externa | T5, T13 (e ausência de ferramenta de envio, T8) |
| §5 Memória contextual | T9 (`memorias`, histórico), T10 (`blocoContexto`) |
| §5 Agendador | T15 |
| §9 Rastreabilidade | T9 (`agente_acoes`) |
| §9 Controle de custo | T9 (`agente_uso`, `MAX_VOLTAS`), T10 (prompt estável, modelo trocável por env) |
| §9 Minimização / isolamento | Global Constraints, T3–T6 |
| §9 Exclusão de dados (LGPD) | **Fora deste plano** (fase 2); anotado no README no T16 |
| §4 Marketing | T8 (`salvar_rascunho_post`) |
| §4 Financeiro | T4 (`pagamento_registrar`), sem telas próprias |
