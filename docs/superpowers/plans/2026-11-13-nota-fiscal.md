# MEIagente — Task 17: Nota fiscal assistida e controle de faturamento

> Extensão do plano [`2026-11-12-mei-agente-mvp.md`](2026-11-12-mei-agente-mvp.md). Vale tudo de lá: **Global Constraints**, fluxo do [`AGENTS.md`](../../../AGENTS.md), TDD, texto em pt-BR sem travessão. Branch de trabalho: `feat/nota-fiscal` (base `developer` em 8c3a8ef).

**Goal:** tirar do MEI prestador de serviço os quatro gargalos da nota fiscal: (1) preencher a NFS-e no Emissor Nacional, (2) esquecer de emitir, (3) não saber quanto faturou no ano, (4) emitir ou mandar nota errada. O agente **prepara** a nota a partir do banco; o MEI **confere, aprova e emite** no portal; o sistema **confere a nota emitida** contra o rascunho.

**Fora do escopo (fase 2):** emissão automática pela API do Emissor Nacional (exige certificado A1 do MEI) ou por intermediário pago (NFE.io, Focus NFe, PlugNotas); cancelamento pelo sistema; NF-e de produto (SEFAZ estadual); relatório mensal de receitas brutas e DASN-SIMEI (ficam como Task 18, reaproveitando `faturamento_ano`).

## Princípios (somam às Global Constraints)

- **Nada é emitido pelo sistema.** A nota sai pelo Emissor Nacional (gov.br/nfse), pela mão do MEI. Não existe ferramenta `emitir_nota`, como não existe `enviar_mensagem`.
- **O modelo nunca escreve número de nota.** `preparar_nota_fiscal` recebe só `servico_id` (e, opcional, `valor_parcial`); valor, tomador, descrição base, códigos fiscais e competência vêm do banco.
- **Registrar a emissão é ação do usuário** (server action com botão), nunca ferramenta do modelo.
- **Validação em quatro pontos:** ao preparar (regras que barram), no cartão (avisos que exigem confirmação), depois de emitir (conferência da nota emitida contra o rascunho), ao mandar para o cliente (só nota emitida, só para o tomador).

## Step 0: conferir antes de codar (não verificado neste plano)

O builder confere na documentação oficial do Emissor Nacional / NFS-e padrão nacional e registra o que achou no topo de `supabase/09-fiscal.sql`, num comentário com a data e a fonte:

1. Formato do **código de tributação nacional** (`cTribNac`) e do **NBS**, e onde baixar a tabela oficial.
2. **Layout do XML** da NFS-e emitida: caminho das tags do tomador (CPF/CNPJ), valor do serviço, competência, código de tributação, número da nota e chave de acesso. Usar um XML de exemplo da documentação como fixture em `tests/fiscal/fixtures/`.
3. **Limite anual do MEI** vigente e a regra de excesso (até 20% / acima de 20%).
4. **Prazo de cancelamento/substituição** de NFS-e no Emissor Nacional.
5. Obrigatoriedade de nota para tomador **pessoa física** e **pessoa jurídica** no caso do MEI.
6. Campos novos da reforma tributária (IBS/CBS) no layout de 2026 que afetem a conferência do XML.

Se algum item contradisser este plano, **pare e avise o orquestrador** antes de implementar. Valores "a confirmar" abaixo ficam numa função única (`fiscal_parametros(p_ano)`), nunca espalhados.

**Resultado do Step 0 (17a, 13/11/2026):**
- **Limite do MEI muda por ano (LC 238, de 21/10/2026):** até 2026 R$ 81.000; 2027 R$ 110.000; a partir de 2028 R$ 140.000. Regra dos 20% inalterada: até 20% de excesso o MEI segue no ano e desenquadra em 1/1 do ano seguinte, com DAS complementar; acima de 20%, desenquadramento retroativo a 1/1 (ou à abertura). Limite proporcional do 1º ano de atividade fica fora (não há data de abertura do CNPJ no banco): pendência.
- **Cancelamento/substituição:** não há prazo nacional; cada município define. Erro de valor ou de tomador não se corrige por substituição: exige cancelar e emitir outra.
- **Obrigatoriedade (Res. CGSN 140/2018, art. 106):** MEI dispensado para consumidor final pessoa física (salvo se pedir); obrigatória para PJ (salvo nota de entrada do destinatário). Confirma `tarefas_gerar_notas` só para PJ.
- **IBS/CBS (NTs 007 a 009/2026):** grupo não exigido do MEI em 2026; os campos que conferimos não mudam.

## Review Focus

1. **Nota com valor diferente do serviço** não pode ser aprovada (a não ser parcial explícita, e a soma das parciais não passa do total). → T17a
2. **Clique duplo em "preparar nota"** ou chamada repetida do modelo: uma nota ativa por serviço; a 2ª devolve a mesma. → T17a
3. **CPF/CNPJ com dígito verificador errado** é barrado antes do cartão; PJ sem CNPJ não gera nota. → T17a
4. **Nota emitida diferente do rascunho** (XML ou número/valor informados): nota vai para `divergente`, abre tarefa `corrigir_nota`, e o cartão mostra o que difere. → T17a, T17b
5. **Mensagem de envio de nota** só com nota `emitida` e só para o cliente tomador; valor citado diferente da nota mostra aviso. → T17a, T17c
6. **Aprovar com avisos não confirmados** é recusado (município diferente, possível duplicata, limite). → T17a, T17d

## Estrutura de arquivos

```text
supabase/09-fiscal.sql                    tudo de SQL desta task (altera tabelas de 02, 04 e 05 de forma idempotente)
src/lib/fiscal/{documento,xml,codigos,tipos}.ts
src/lib/agente/ferramentas/{definicoes,executar}.ts   (modifica: 3 ferramentas novas, cartão "nota")
src/lib/agente/prompt.ts                  (modifica: regras de nota no PROMPT_SISTEMA)
src/app/painel/notas/{page.tsx,Termometro.tsx}
src/app/painel/agente/{Cartao.tsx,cartao-dados.ts,actions.ts}   (modifica: cartão de nota)
src/app/painel/negocio/{NegocioForm.tsx,actions.ts}            (modifica: dados fiscais)
src/app/painel/PainelShell.tsx            (modifica: item "Notas" no menu)
src/lib/dominio/tipos.ts                  (modifica: tipos novos)
tests/sql/fiscal.test.ts, tests/fiscal/{documento,xml}.test.ts, tests/fiscal/fixtures/*.xml, tests/agente/ferramentas-fiscal.test.ts
```

## Ordem e paralelismo

`T17a (SQL) → T17c (agente) → T17d (telas)`. **T17b** (TS puro: documento, XML, códigos) corre em paralelo com T17a desde o início. Cada parte é uma branch `feat/t17x-<slug>` a partir de `feat/nota-fiscal`, com PR de volta para `feat/nota-fiscal`; quando tudo estiver verde, `feat/nota-fiscal → developer` com ok do dono.

---

### Task 17a: SQL fiscal (dados, nota, regras, faturamento, pendências)

**Files:**
- Create: `supabase/09-fiscal.sql`, `tests/sql/fiscal.test.ts`; Modify: `src/lib/dominio/tipos.ts`

**Interfaces:**
- Produces (alterações idempotentes, `add column if not exists` e troca de `check` por nome):
  - `meis` + `cnpj text`, `inscricao_municipal text`, `municipio text`, `codigo_tributacao text`, `nbs text`, `descricao_padrao_nota text`
  - `clientes` + `documento text` (só dígitos; 11 = CPF, 14 = CNPJ), único parcial `(mei_id, documento)`
  - `tarefas.tipo` passa a aceitar `'emitir_nota'` e `'corrigir_nota'`; `tarefas.servico_id` continua obrigatório
  - `mensagens.objetivo` passa a aceitar `'envio_nota'`; `mensagens` + `nota_id uuid references notas_fiscais on delete set null`
- Produces (novo):
  - `fiscal_parametros(p_ano int default null) → jsonb` — `{ano, limite_anual, tolerancia_excesso, dias_para_emitir, dias_duplicata}`; `p_ano` nulo = ano de hoje (SP); limite `≤2026: 81000`, `2027: 110000`, `≥2028: 140000`; tolerância `0.20`; `5` e `30` dias. `faturamento_ano` e `nota_preparar` passam o ano da competência
  - `documento_valido(p_doc text) → text` — devolve os dígitos se CPF (11) ou CNPJ (14) tiver dígitos verificadores corretos e não for sequência repetida; senão `null`
  - `mei_dados_fiscais_salvar(p_mei, p_dados jsonb) → meis` — `{cnpj, inscricao_municipal, municipio, codigo_tributacao, nbs, descricao_padrao_nota}`; `cnpj` inválido → `regra: CNPJ do negócio inválido`; campo ausente não apaga
  - `cliente_documento_salvar(p_mei, p_cliente, p_documento) → clientes` — inválido → `regra: CPF ou CNPJ inválido`; já usado por outro cliente do MEI → `regra: já existe outro cliente com esse CPF/CNPJ`
  - `notas_fiscais(id, mei_id, servico_id, cliente_id, numero_seq int por MEI, valor numeric(12,2), parcial bool, competencia date, descricao text, codigo_tributacao, nbs, municipio_prestacao, tomador_documento, avisos jsonb, avisos_confirmados bool, status, aprovado_em, aprovado_por, emitida_em, numero_nfse text, chave_acesso text, conferencia jsonb, criado_em, atualizado_em)`
  - Status: `rascunho → aprovado → emitida | divergente`; `rascunho → descartado`; `divergente → emitida` (depois de corrigida) ou `cancelada`. Único parcial: **uma nota não parcial ativa** (`status not in ('descartado','cancelada')`) por serviço.
  - `nota_preparar(p_mei, p_servico, p_valor_parcial numeric default null) → notas_fiscais` — **regras que barram:**
    - serviço não `executado`/`pago` → `regra: a nota só pode ser preparada depois do serviço executado`
    - MEI sem `cnpj` ou `codigo_tributacao` → `regra: complete os dados fiscais em Meu negócio`
    - cliente sem `documento` → `regra: informe o CPF ou CNPJ do cliente`
    - já existe nota ativa não parcial → **devolve a existente** (idempotente, Review Focus 2)
    - `p_valor_parcial` ≤ 0, ou soma das parciais ativas + este > `servico.valor` → `regra: o valor das notas passa do valor do serviço`
    - competência = data do último pagamento, ou hoje (SP); nunca futura
    - preenche `avisos` (lista de `{codigo, texto}`): `municipio_diferente` (local do serviço fora da cidade do MEI, quando dá para saber), `possivel_duplicata` (outra nota ativa do mesmo cliente e mesmo valor em `dias_duplicata`), `limite_90` / `limite_100` (faturamento do ano + esta nota), `pagamento_diferente` (pago ≠ valor da nota)
    - refaz se `rascunho` (recalcula tudo), recusa se `aprovado`/`emitida`
  - `nota_decidir(p_mei, p_id, p_decisao, p_user, p_avisos_confirmados bool default false) → jsonb {id, status, mudou}` — mesmo contrato do `item_decidir` (só age em `rascunho`, repetição devolve `mudou:false`); `aprovar` com `avisos` não vazio e `p_avisos_confirmados` falso → `regra: confirme os avisos antes de aprovar`; grava `agente_acoes` tipo `decisao` como o `item_decidir`
  - `nota_registrar_emissao(p_mei, p_id, p_dados jsonb) → jsonb {status, diferencas}` — exige `aprovado` ou `divergente`; `p_dados: {numero_nfse, chave_acesso?, valor?, tomador_documento?, competencia?, codigo_tributacao?}` (vindo do XML conferido no TS ou digitado). Compara cada campo presente com a nota; sem diferença → `emitida`; com diferença → `divergente`, `conferencia = {campo: {esperado, emitido}}` e tarefa `corrigir_nota` aberta (Review Focus 4). `numero_nfse` vazio → `regra:`. Emitida de novo com os mesmos dados → idempotente.
  - `nota_ver(p_mei, p_id) → jsonb {nota, mei, cliente, servico}` — para cartão e tela; outro MEI → `regra: nota não encontrada`
  - `notas_listar(p_mei, p_status text default null) → setof` (com nome do cliente e número do serviço)
  - `faturamento_ano(p_mei, p_ano int default null) → jsonb {ano, total, com_nota, sem_nota, limite, percentual, projecao, faixa}` — `total` = soma de `pagamentos` do ano (SP); `com_nota` = parte coberta por notas `emitida`; `projecao` linear até 31/12; `faixa ∈ ok|atencao(≥70%)|alerta(≥90%)|excedido(>100%)|excedido_grave(>100%+tolerância)`
  - `tarefas_gerar_notas(p_dias int default null) → table(mei_id, tarefa_id, servico_id)` — serviço `pago` de cliente com documento de 14 dígitos (PJ), pago há ≥ `dias_para_emitir`, sem nota ativa, sem tarefa `emitir_nota` aberta; mesmo padrão de `tarefas_gerar_followups` (on conflict, todos os MEIs)
  - Trigger em `mensagens`: `objetivo = 'envio_nota'` exige `nota_id` de nota `emitida` do mesmo MEI e com `cliente_id` igual ao da nota → senão `regra: só dá para mandar nota já emitida, para o cliente da nota` (Review Focus 5)

- [ ] **Step 1:** Testes:
  - `documento_valido`: CPF e CNPJ válidos conhecidos passam; um dígito trocado → `null`; `111.111.111-11` → `null`; formatação com pontos e barra aceita.
  - **Review Focus 3:** `cliente_documento_salvar` com CNPJ de dígito errado → `regra:`; `nota_preparar` para cliente sem documento → `regra: informe o CPF ou CNPJ do cliente`.
  - `nota_preparar` em serviço `confirmado` → `regra:`; em serviço `pago` → nota `rascunho` com valor, tomador e códigos do banco.
  - **Review Focus 2:** `nota_preparar` duas vezes → mesmo `id`, `count(*) = 1`.
  - **Review Focus 1:** parcial 500 + parcial 400 em serviço de 800 → 2ª dá `regra:`; parcial 300 + 500 → ok.
  - **Review Focus 6:** nota com `possivel_duplicata` → `nota_decidir(aprovar)` sem confirmação dá `regra:`; com confirmação aprova; aprovar de novo → `mudou:false`.
  - **Review Focus 4:** `nota_registrar_emissao` com valor 80 numa nota de 800 → `divergente`, `conferencia.valor = {esperado: 800, emitido: 80}`, 1 tarefa `corrigir_nota` aberta; registrar de novo com 800 → `emitida`.
  - `nota_registrar_emissao` em nota `rascunho` → `regra: aprove a nota antes de registrar a emissão`.
  - **Review Focus 5:** `mensagem_rascunhar` com `objetivo envio_nota` e nota `aprovado` → `regra:`; com nota `emitida` e outro `cliente_id` → `regra:`; com nota emitida e o cliente certo → ok.
  - `faturamento_ano`: pagamentos 30000 + 35000 com uma nota emitida de 30000 → `total 65000, com_nota 30000, sem_nota 35000, faixa atencao` (com limite 81000).
  - `tarefas_gerar_notas`: serviço pago de PJ há 6 dias → 1 tarefa; rodar de novo → continua 1; cliente PF não gera; serviço com nota emitida não gera.
  - Isolamento: toda função com id de outro MEI se comporta como id inexistente.
  - Idempotência: carregar `09-fiscal.sql` duas vezes não quebra (já coberto pelo `abrirBancoTeste`).
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: nota fiscal assistida no sql`.

**Decisões da 17a (13/11, revisadas pelo orquestrador):**
- Arquivo é `09-fiscal.sql` (a `developer` ganhou `08-proatividade.sql`); roda depois do 08.
- `mensagem_rascunhar` (do 04) é **redefinida** no 09 para aceitar `envio_nota` e `nota_id`. Rodar o 04 de novo sem o 09 volta a versão antiga: sempre rodar o 09 depois.
- Nota parcial: cada chamada cria uma parcial nova (a soma limita); nota inteira em rascunho é refeita com o mesmo id.
- `municipio_diferente` só avisa quando o endereço termina em "Cidade/UF" ou "Cidade - UF".
- `tarefas_gerar_notas` não recria se já houve qualquer tarefa `emitir_nota` do serviço.
- `faturamento_ano` usa `pagamentos.criado_em` como data do recebimento.
- **Falta `nota_cancelar(p_mei, p_id)`** (status `cancelada` existe, função não): entra na 17d se o cartão tiver "Cancelar"; o caminho normal do divergente é registrar de novo.

### Task 17b: Documento, XML e códigos em TypeScript puro

**Files:**
- Create: `src/lib/fiscal/{tipos,documento,xml,codigos}.ts`, `tests/fiscal/{documento,xml}.test.ts`, `tests/fiscal/fixtures/nfse-exemplo.xml`

**Interfaces:**
- Produces:
  - `documentoValido(doc: string): string | null` (mesmo algoritmo do SQL, para validar formulário antes de ir ao banco) e `formatarDocumento(digitos: string): string` → `"123.456.789-09"` / `"12.345.678/0001-95"`
  - `lerNfse(xml: string): { numero_nfse: string; chave_acesso: string | null; valor: number; tomador_documento: string; competencia: string; codigo_tributacao: string | null } | { erro: string }` — sem dependência nova (usar `DOMParser` não existe no Node: parser mínimo por regex sobre as tags do Step 0, ou `fast-xml-parser` **só com ok do orquestrador**); XML que não é NFS-e → `{ erro: "Este arquivo não parece ser uma NFS-e." }`
  - `CODIGOS_SUGERIDOS: { atividade: string; codigo_tributacao: string; nbs: string | null; descricao: string }[]` — eletricista, técnico de manutenção (refrigeração), fotógrafo, só com códigos **conferidos na tabela oficial** (Step 0); código não conferido não entra
  - `sugerirCodigos(atividade: string | null): typeof CODIGOS_SUGERIDOS` — busca sem acento/caixa

- [ ] **Step 1:** Testes: `documentoValido` com os mesmos casos do T17a (os dois algoritmos precisam concordar); `lerNfse(fixture)` devolve todos os campos; XML de outro tipo → `erro`; valor com vírgula ou ponto lido certo; `sugerirCodigos("Técnico de manutenção")` acha a linha.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: documento, xml da nfse e codigos sugeridos`.

### Task 17c: Ferramentas e prompt

**Files:**
- Modify: `src/lib/agente/ferramentas/{definicoes,executar}.ts`, `src/lib/agente/prompt.ts`, `tests/agente/prompt.test.ts` (se a contagem de ferramentas estiver testada); Create: `tests/agente/ferramentas-fiscal.test.ts`

**Interfaces:**
- Consumes: T17a, `sugerirCodigos` (T17b), `valoresDivergentes`.
- Produces:
  - `Cartao.tipo` ganha `"nota"`
  - Ferramentas novas (descrições curtas: o modelo tem 32k de contexto):

| Ferramenta | Entrada | Chama | Cartão |
|---|---|---|---|
| `preparar_nota_fiscal` | `servico_id, valor_parcial?` | `nota_preparar` | nota |
| `salvar_documento_cliente` | `cliente_id, documento` | `cliente_documento_salvar` | |
| `consultar_faturamento` | `ano?` | `faturamento_ano` | |

  - `redigir_mensagem` aceita `objetivo: "envio_nota"` e `nota_id?`; com `nota_id`, o executor compara o texto com o valor da nota via `valoresDivergentes` e devolve `aviso_valores`
  - Resultado de `preparar_nota_fiscal` traz os `avisos` para o modelo citar ("deixei um aviso no cartão: …"), nunca os valores para ele reescrever
  - Prompt (redação livre, sem data nem número): nota só depois do serviço executado; pedir CPF/CNPJ do cliente quando faltar; **nunca dizer que emitiu a nota**: ele prepara, o MEI emite no Emissor Nacional e registra; ao falar de faturamento, usar `consultar_faturamento`, nunca somar de cabeça; sugerir completar os dados fiscais em Meu negócio quando a regra pedir

- [ ] **Step 1:** Testes (PGlite): cenário ponta a ponta só com `executarFerramenta`: cliente PJ com CNPJ → serviço fechado 800 → pagamento 800 → `preparar_nota_fiscal` devolve cartão `nota` e `erro:false`; repetir → mesmo id; `preparar_nota_fiscal` com `servico_id` aleatório → `erro:true` com "não encontrado"; `salvar_documento_cliente` com dígito errado → `erro:true`; `redigir_mensagem` `envio_nota` citando "R$ 80" numa nota de 800 → `aviso_valores`; nenhuma ferramenta nova começa com `emitir` ou `enviar`.
- [ ] **Step 2–4:** Run (FAIL) → implementar → Run (PASS).
- [ ] **Step 5:** Commit `feat: ferramentas de nota fiscal no agente`.

### Task 17d: Telas (cartão de nota, dados fiscais, página Notas e termômetro)

**Files:**
- Create: `src/app/painel/notas/{page.tsx,Termometro.tsx}`; Modify: `src/app/painel/agente/{Cartao.tsx,cartao-dados.ts,actions.ts}`, `src/app/painel/negocio/{NegocioForm.tsx,actions.ts}`, `src/app/painel/PainelShell.tsx`

**Interfaces:**
- Consumes: `nota_ver`, `nota_decidir`, `nota_registrar_emissao`, `notas_listar`, `faturamento_ano`, `mei_dados_fiscais_salvar`, `lerNfse`, `formatarDocumento`, `sugerirCodigos`.
- Produces: actions `decidirNota(id, decisao, avisosConfirmados)`, `registrarEmissao(id, formData)` (aceita arquivo `.xml` até 200 KB **ou** número + valor digitados; o XML é lido no servidor com `lerNfse` e só os campos extraídos vão para o SQL), `salvarDadosFiscais(prev, formData)`; todas com `requireMei()` e `regra:` devolvido como `{ erro }`.

Comportamento:
- **Cartão de nota (rascunho):** campos na ordem do Emissor Nacional, cada um com botão **[Copiar]**: tomador (documento formatado e nome), competência, código de tributação, NBS, município, descrição, valor. Avisos em âmbar com caixa "Conferi os avisos" que habilita **[Aprovar]**. **[Descartar]**. Sem edição de valor no cartão: valor errado se corrige no serviço e a nota é preparada de novo.
- **Cartão aprovado:** link **[Abrir o Emissor Nacional]** (`https://www.nfse.gov.br/EmissorNacional`, conferir no Step 0) e **[Registrar emissão]** (anexar XML ou digitar número e valor).
- **Cartão divergente:** vermelho, tabela "esperado × emitido" com cada diferença, e o texto "Cancele ou substitua a nota no Emissor Nacional dentro do prazo do seu município e registre de novo. Erro de valor ou de cliente exige cancelar e emitir outra." (sem número de dias: o prazo é municipal).
- **Cartão emitido:** número da nota, data, e **[Mandar para o cliente]** (abre o agente com o pedido de mensagem `envio_nota`).
- **Meu negócio:** seção "Dados fiscais" (CNPJ, inscrição municipal, município, código de tributação e NBS com sugestões de `sugerirCodigos(mei.atividade)`, descrição padrão da nota). CNPJ validado com `documentoValido` antes de enviar.
- **Página Notas** (menu "Notas", depois de "Documentos"): termômetro do ano no topo (barra com `percentual`, `faixa` em cor, total, com nota / sem nota, projeção, e o texto da faixa: em `excedido`/`excedido_grave`, explicar a consequência com o valor do Step 0 e sugerir procurar um contador); lista de notas com filtro por status (`Segmented`); notas a emitir (tarefas `emitir_nota`) com **[Preparar nota]**.

- [ ] **Step 1:** `npm run build`; conferência manual com o seed: preparar nota do serviço pago, ver avisos, aprovar, registrar com o XML de exemplo (divergente, porque o valor do exemplo não bate) e depois com número e valor certos (emitida).
- [ ] **Step 2:** Commit `feat: telas de nota fiscal e termometro do faturamento`.

---

## Integração depois da Task 17

- **T15 (proatividade):** o cron também chama `tarefas_gerar_notas()`; o Início mostra "Notas a emitir" e o termômetro quando a faixa for `alerta` ou pior.
- **Seed (`supabase/seed/demo.sql`):** dar CNPJ e dados fiscais à "Refrigeração Bueno", CNPJ a um dos clientes e um serviço pago de PJ há 6 dias (vira "nota a emitir" na demo).
- **Roteiro da demo (T16):** "o serviço da empresa X foi pago, prepara a nota" → cartão com campos para copiar → aprovar → registrar com o número → "quanto já faturei este ano?".
- **Task 18 (fase seguinte):** relatório mensal de receitas brutas e DASN-SIMEI pré-preenchida a partir de `faturamento_ano` e `notas_listar`.

## Cobertura dos gargalos

| Gargalo | Onde |
|---|---|
| Preencher a NFS-e certo | T17a (`nota_preparar`, dados fiscais), T17b (códigos), T17d (cartão com Copiar) |
| Esquecer de emitir | T17a (`tarefas_gerar_notas`), T17d (Notas a emitir), integração T15 |
| Não saber o faturamento | T17a (`faturamento_ano`), T17c (`consultar_faturamento`), T17d (termômetro) |
| Emitir ou mandar nota errada | Review Focus 1 a 6: regras no SQL, avisos confirmados, conferência do XML, envio só de nota emitida |
