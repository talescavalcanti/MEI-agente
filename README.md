<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/marca/meiagente-fundo-escuro.svg" />
    <img alt="MEIagente" src="docs/marca/meiagente.svg" width="420" />
  </picture>
</h1>

<p>
Assistente administrativo, comercial e de marketing para Microempreendedores Individuais.<br/>
O MEI descreve o serviço em uma frase. O agente organiza o resto e só age com a aprovação dele.
</p>

<p>
<img alt="AKCIT Camp 2026" src="https://img.shields.io/badge/AKCIT%20Camp-2026-1f2328?style=flat-square" />
<img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-1f2328?style=flat-square&logo=nextdotjs&logoColor=white" />
<img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-1f2328?style=flat-square&logo=supabase&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-1f2328?style=flat-square&logo=typescript&logoColor=white" />
<img alt="Testes" src="https://img.shields.io/badge/testes-584%20passando-1f2328?style=flat-square" />
</p>

<p>
<b>Pitch:</b> <a href="https://meiagente.talescavalcanti.dev/lp">landing page</a> &nbsp;·&nbsp; <b>Demo em vídeo:</b> <a href="https://pub-544e5cb5fea74a52aaeb7059bd01a459.r2.dev/meiagente-video-compressed.mp4">assistir</a> &nbsp;·&nbsp; <b>App:</b> <a href="https://meiagente.talescavalcanti.dev">meiagente.talescavalcanti.dev</a>
</p>

<p>
<a href="#1-o-problema">Problema</a>
&nbsp;&middot;&nbsp;
<a href="#2-a-solução">Solução</a>
&nbsp;&middot;&nbsp;
<a href="#3-exemplo-de-uso">Exemplo</a>
&nbsp;&middot;&nbsp;
<a href="#5-arquitetura">Arquitetura</a>
&nbsp;&middot;&nbsp;
<a href="#9-segurança-privacidade-e-lgpd">Segurança</a>
&nbsp;&middot;&nbsp;
<a href="#14-como-rodar">Como rodar</a>
</p>

</div>

<br/>

> [!NOTE]
> **Status:** MVP em desenvolvimento para o AKCIT Camp (hackathon). O banco de domínio e o cadastro inicial já estão implementados; chat, telas de consulta e agendador ainda estão em integração.

<br/>

<table>
<tr>
<td width="33%" valign="top">

**Para quem**

Prestadores de serviço que trabalham sozinhos: eletricistas, técnicos de manutenção, fotógrafos e autônomos em geral.

</td>
<td width="33%" valign="top">

**O que resolve**

Orçamento, contrato, confirmação, agenda e follow-up hoje ficam espalhados entre WhatsApp, planilhas e papel.

</td>
<td width="33%" valign="top">

**Como**

Um agente com ferramentas, regras de negócio no banco e aprovação humana antes de qualquer ação externa.

</td>
</tr>
</table>

<br/>

## Sumário

| | | |
|---|---|---|
| [1. O problema](#1-o-problema) | [6. Ferramentas do agente](#6-ferramentas-do-agente) | [11. Validação](#11-validação) |
| [2. A solução](#2-a-solução) | [7. Modelo de dados](#7-modelo-de-dados) | [12. Roadmap](#12-roadmap) |
| [3. Exemplo de uso](#3-exemplo-de-uso) | [8. Escopo do MVP](#8-escopo-do-mvp) | [13. Estrutura do projeto](#13-estrutura-do-projeto) |
| [4. Funcionalidades](#4-funcionalidades) | [9. Segurança, privacidade e LGPD](#9-segurança-privacidade-e-lgpd) | [14. Como rodar](#14-como-rodar) |
| [5. Arquitetura](#5-arquitetura) | [10. Riscos e gaps](#10-riscos-e-gaps) | [15. O papel do AKCIT Camp](#15-o-papel-do-akcit-camp) |
| [Business Model Canvas](docs/bmc.md) | [Equipe](#equipe) | [Licença](#licença) |
| [Fluxo do agente](docs/fluxo-do-agente.md) | | |

<br/>

## 1. O problema

No Brasil, muitos MEIs acumulam funções: executam o serviço, atendem clientes, fazem orçamentos, elaboram contratos, organizam agenda, divulgam o negócio e acompanham pagamentos. Essa sobrecarga administrativa consome o tempo que deveria ir para a atividade principal e para a conquista de novos clientes.

É especialmente crítico para prestadores de serviço que trabalham sozinhos. O dia a dia costuma rodar em ferramentas desconectadas: WhatsApp, Instagram, planilhas e documentos soltos.

#### A dor administrativa

| Indicador | Valor | Fonte |
|:---|:---:|:---:|
| MEIs do **Nordeste** que apontam obstáculos para cumprir exigências administrativas e tributárias | **37%** | [1] |
| A mesma dificuldade na média nacional | **32%** | [1] |
| MEIs que não fazem o controle diário das receitas | **39%** | [2] |
| MEIs que não fazem o controle diário das despesas | **33%** | [2] |

Na pesquisa qualitativa *Dores dos Pequenos Negócios*, do Sebrae, a falta de tempo para cuidar da parte administrativa e comercial aparece entre os principais desafios [3].

#### A IA ainda não chegou ao trabalho do dia a dia

| Indicador (recorte MEI) | Valor | Fonte |
|:---|:---:|:---:|
| Usam IA regularmente em marketing e comunicação | **29%** | [4] |
| Já fizeram testes com IA | **23%** | [4] |
| Não usam, mas pretendem usar em breve | **28%** | [4] |
| Apontam como principal obstáculo não saber como aplicar IA no negócio | **23%** | [5] |

#### Tamanho do mercado

| Indicador | Valor | Fonte |
|:---|:---:|:---:|
| MEIs ativos no Brasil em 2026 | **17 milhões** | [6] |
| MEIs em atividade no setor de serviços, o público do MEIagente | **7,6 milhões** | [7] |

<sub>
[1] FGV em parceria com o Sebrae, divulgado em out/2026. <a href="https://movimentoeconomico.com.br/economia/lei-de-incentivos/tributacao/2026/10/22/nordeste-concentra-maior-dificuldade-burocratica-entre-meis-aponta-pesquisa/">Movimento Econômico</a><br/>
[2] Sebrae, <i>Educação Financeira do MEI</i>, 2018, mil entrevistas. <a href="https://www.bcb.gov.br/Nor/relcidfin/docs/art9_educacao_finanaceira_MEIs.pdf">Banco Central</a><br/>
[3] Sebrae, <i>Dores dos Pequenos Negócios</i>, pesquisa qualitativa, jan/2023. <a href="https://datasebrae.com.br/wp-content/uploads/2024/10/Pesquisa-Dores-dos-Pequenos-Negocios_Jan2023-resumo.pdf">Data Sebrae</a><br/>
[4] Sebrae, <i>Pulso dos Pequenos Negócios</i>, 13ª edição (nov/2026). <a href="https://agenciasebrae.com.br/?p=43963">Agência Sebrae</a><br/>
[5] Sebrae, FGV IBRE e Google. Coleta em set/2025, cerca de 5.000 empresas (jan/2026). <a href="https://agenciasebrae.com.br/dados/pequenos-negocios-abracam-a-inteligencia-artificial-para-otimizar-o-tempo-e-inovar/">Agência Sebrae</a><br/>
[6] Portal do Empreendedor, em estudo da Fecomércio MG (jul/2026): 17.075.033 MEIs ativos. <a href="https://fecomerciomg.org.br/wp-content/uploads/2026/07/Estudo-sobre-o-MEI-2026.pdf">Fecomércio MG</a><br/>
[7] Sebrae, com dados da Receita Federal (mar/2026), que contam cerca de 13,1 milhões de MEIs em atividade. <a href="https://melhorinvestimento.net/noticias/recorde-meis-brasil-2025-pejotizacao">Melhor Investimento</a><br/>
Em Pernambuco, 25% dos empreendedores usam IA regularmente em marketing e comunicação e 32% planejam usar em breve (Pulso, 13ª edição). <a href="https://www.diariodepernambuco.com.br/economia/2026/10/11726740-pesquisa-do-sebrae-indica-que-25-dos-empreendedores-pernambucanos-usam-ia-nos-negocios.html">Diário de Pernambuco</a>
</sub>

<br/><br/>

**Oportunidade:** tornar a IA útil para quem não tem conhecimento técnico, integrando-a diretamente às tarefas do cotidiano.

<br/>

## 2. A solução

Uma plataforma de gestão apoiada por um agente de IA que entende o que o microempreendedor precisa, organiza processos e executa fluxos de trabalho com a autorização dele.

O agente não é só um chatbot que gera texto. Ele:

- tem acesso ao contexto autorizado do negócio;
- usa ferramentas para consultar e atualizar registros;
- planeja sequências de ações;
- acompanha processos ao longo do tempo.

| Automação convencional | Agente |
|:---|:---|
| Segue fluxos fixos | Interpreta linguagem natural |
| Exige dados completos | Lida com informação incompleta e pergunta o que falta |
| Um caminho por tarefa | Escolhe as ferramentas e adapta o plano a cada serviço |

> [!IMPORTANT]
> A IA interpreta e prepara as ações. As regras de negócio garantem a consistência dos registros. Qualquer ação externa, como enviar uma mensagem ou um documento, só acontece depois da aprovação do usuário.

#### Por que não usar o que já existe

Hoje o MEI resolve isso com três tipos de ferramenta. Cada uma cobre só uma parte do caminho.

| | Assistente de IA genérico | WhatsApp e planilha | App de gestão | **MEIagente** |
|:---|:---:|:---:|:---:|:---:|
| Entende uma frase solta, como "fechei um serviço de R$ 800 para sexta" | Sim | Não | Não | **Sim** |
| Conhece os clientes, preços e histórico do negócio | Não | Em parte, à mão | Sim | **Sim** |
| Registra cliente, serviço, agenda e pagamento | Não | À mão | Sim, por formulário | **Sim, a partir da conversa** |
| Gera orçamento e contrato com os dados do negócio | Em parte, sem salvar | Não | Às vezes | **Sim** |
| Lembra sozinho das propostas paradas | Não | Não | Raramente | **Sim** |
| Pede aprovação antes de qualquer ação externa | Não se aplica | Não se aplica | Não se aplica | **Sim** |
| Exige conhecimento técnico ou configuração | Saber escrever bons pedidos | Não | Aprender o sistema | **Não** |

<sub>Comparação por categoria de ferramenta, sem citar produtos específicos.</sub>

**Em resumo:** o assistente genérico escreve, mas não guarda nem acompanha nada. A planilha guarda, mas não faz nada sozinha. O app de gestão organiza, mas exige que o MEI preencha formulários. O MEIagente junta as três coisas a partir de uma conversa.

#### Referência de preço

O MEI já paga por ferramentas mais simples. A faixa do MEIagente acompanha o que esse público aceita hoje, bem abaixo de um ERP.

| Ferramenta | Preço mensal | O que oferece |
|:---|:---:|:---|
| Qipu, plano MEI | R$ 18,90 | Gestão financeira, DAS, nota de serviço, orçamentos e cobranças |
| Company Hero, plano MEI | R$ 29,90 | Regularidade do CNPJ e alertas do DAS |
| Nota Rápida (MarketUP), premium | R$ 49,99 | Nota de serviço e orçamentos pelo celular |
| ERPs para pequenas empresas | R$ 119 a R$ 169 | Gestão completa, pensada para empresas maiores |
| **MEIagente** | **R$ 19 a R$ 39** | **Tudo a partir de uma conversa, com aprovação do MEI. Faixa a validar com MEIs** |

<sub>Preços públicos consultados em 13/11/2026: <a href="https://www.serasaexperian.com.br/conteudos/plataformas-gestao-financeira-melhor-custo-beneficio/">Serasa Experian (Qipu)</a>, <a href="https://www.companyhero.com/plano-mei-hero-money-drop">Company Hero</a>, <a href="https://apps.apple.com/br/app/nota-r%C3%A1pida-nfse-mei-mobile/id6444369771">App Store (Nota Rápida)</a> e <a href="https://www.serasaexperian.com.br/conteudos/melhor-app-controlar-financas-empresa/">Serasa Experian (ERPs)</a>.</sub>

<br/>

## 3. Exemplo de uso

Um técnico de manutenção escreve, em linguagem natural:

> Fechei uma instalação de ar-condicionado por R$ 800 para sexta-feira.

A partir dessa única mensagem:

| Etapa | O que o agente faz |
|:---|:---|
| **1. Interpreta** | Serviço: instalação de ar-condicionado. Valor: R$ 800. Data: sexta-feira. |
| **2. Verifica** | Faltam nome do cliente, telefone, endereço e forma de pagamento. |
| **3. Pergunta** | "Qual o nome e o WhatsApp do cliente? O pagamento é à vista ou parcelado?" |
| **4. Prepara** | Orçamento, minuta de contrato, mensagem de confirmação e agendamento. |
| **5. Pede aprovação** | Cada item aparece num cartão com as opções Aprovar, Editar e Descartar. |

#### Conversa

```text
MEI      Fechei uma instalação de ar-condicionado por R$ 800 para sexta.

Agente   Entendi. Já registrei o serviço para sexta-feira (R$ 800).
         Para continuar preciso de:
           - Nome e WhatsApp do cliente
           - Endereço da instalação
           - Pagamento: à vista, Pix ou parcelado?

MEI      Maria Souza, 62 9XXXX-XXXX, Setor Bueno. Pix na entrega.

Agente   Preparei 3 itens para você revisar:
           1. Orçamento #012 (R$ 800, Pix na entrega)
           2. Minuta de contrato de prestação de serviço
           3. Mensagem de confirmação para a Maria:

              "Olá, Maria! Confirmando a instalação do ar-condicionado
               na sexta-feira, no Setor Bueno. Valor combinado: R$ 800,
               pagamento via Pix na entrega. Qualquer dúvida, é só chamar."

         [ Aprovar ]  [ Editar ]  [ Descartar ]
```

#### Acompanhamento posterior

Dias depois, o agente percebe que uma proposta continua sem resposta e sugere o próximo passo:

```text
Agente   O orçamento #009 (Carlos, troca de fiação, R$ 450) está há
         4 dias sem resposta. Sugiro este lembrete:

         "Oi, Carlos, tudo bem? Passando para saber se conseguiu ver o
          orçamento da troca de fiação. Posso ajustar o que precisar."

         [ Enviar ]  [ Editar ]  [ Ignorar ]
```

<sub>As mensagens e documentos acima são exemplos ilustrativos do comportamento esperado.</sub>

<br/>

## 4. Funcionalidades

| Área | O que o agente faz |
|:---|:---|
| **Atendimento e relacionamento** | Redige mensagens personalizadas para WhatsApp, confirma serviços, envia lembretes e acompanha propostas comerciais. |
| **Documentação** | Gera orçamentos, propostas e minutas de contrato de prestação de serviços a partir dos dados cadastrados. |
| **Marketing digital** | Sugere posts, legendas, campanhas e estratégias de divulgação adaptadas à atividade do MEI. |
| **Gestão operacional** | Organiza clientes, serviços e agendamentos; identifica tarefas pendentes. |
| **Acompanhamento financeiro** | Apoia o registro de valores, pagamentos e cobranças, com ampliação futura. |
| **Nota fiscal assistida** | Prepara o rascunho da NFS-e de um serviço executado com os dados do cadastro, sem que o modelo escreva valor ou tomador. Confere o CPF ou CNPJ do cliente e mostra avisos que precisam ser conferidos antes de aprovar. O MEI emite no Emissor Nacional e registra a emissão; o sistema compara a nota emitida com o rascunho e marca a divergência. A página Notas mostra o faturamento do ano frente ao limite do MEI. |

<br/>

## 5. Arquitetura

Componentes: LLM, banco de dados, memória contextual, ferramentas de execução (function calling) e orquestrador de tarefas.

```mermaid
flowchart TD
    U[MEI - chat / voz] --> O[Orquestrador do agente]

    subgraph Agente
        O --> L[LLM<br/>interpretação e planejamento]
        L --> T[Camada de ferramentas<br/>function calling]
        O <--> M[Memória contextual]
    end

    T --> R[Regras de negócio<br/>validação e consistência]
    R --> DB[(Banco de dados<br/>clientes · serviços · orçamentos<br/>agenda · pagamentos)]
    M --> DB

    T --> D[Gerador de documentos<br/>orçamento · contrato]
    T --> MSG[Rascunhos de mensagens<br/>WhatsApp / Instagram]

    D --> A{Aprovação<br/>do usuário}
    MSG --> A
    A -- aprovado --> X[Ação externa<br/>enviar mensagem / documento]
    A -- recusado / editado --> O

    S[Agendador de tarefas] --> O
    DB --> S
```

#### Fluxo de uma solicitação

1. O usuário envia uma mensagem em linguagem natural.
2. O orquestrador monta o contexto (histórico e dados do negócio) e chama o LLM.
3. O LLM decide quais ferramentas chamar e em que ordem.
4. As regras de negócio validam cada escrita no banco.
5. Ações externas ficam como rascunho até o usuário aprovar.
6. Um agendador revisita pendências, como propostas sem resposta, e reativa o agente.

<br/>

## 6. Ferramentas do agente

<details>
<summary><b>Ver a lista de ferramentas (function calling)</b></summary>
<br/>

Lista proposta. Nomes e assinaturas podem mudar na implementação.

| Ferramenta | Função | Escreve dados | Exige aprovação |
|:---|:---|:---:|:---:|
| `buscar_cliente(nome\|telefone)` | Consulta cadastro de clientes | não | não |
| `criar_ou_atualizar_cliente(dados)` | Cadastra ou edita um cliente | sim | não |
| `registrar_servico(cliente_id, descricao, valor, data)` | Cria o serviço ou pedido | sim | não |
| `listar_dados_faltantes(servico_id)` | Aponta o que ainda falta para fechar o serviço | não | não |
| `gerar_orcamento(servico_id)` | Cria o orçamento | sim | revisão |
| `gerar_minuta_contrato(servico_id)` | Cria a minuta contratual | sim | revisão |
| `redigir_mensagem(cliente_id, objetivo)` | Gera rascunho de mensagem | rascunho | para enviar |
| `agendar_servico(servico_id, data, hora)` | Registra na agenda | sim | não |
| `listar_propostas_pendentes(dias_sem_resposta)` | Acha propostas paradas | não | não |
| `registrar_pagamento(servico_id, valor, forma)` | Lança recebimento | sim | não |
| `sugerir_post_instagram(atividade, objetivo)` | Ideias de conteúdo e legendas | não | não |
| `consultar_conhecimento(termo, cliente_id?, tipo?)` | Busca notas e histórico de clientes, preços, dúvidas frequentes e políticas (adicionada em 13/11) | não | não |
| `enviar_mensagem(rascunho_id)` | Envio real (fase pós-MVP) | externo | sim |

</details>

<br/>

## 7. Modelo de dados

<details>
<summary><b>Ver o diagrama entidade-relacionamento</b></summary>
<br/>

```mermaid
erDiagram
    MEI ||--o{ CLIENTE : atende
    CLIENTE ||--o{ SERVICO : contrata
    SERVICO ||--o| ORCAMENTO : gera
    SERVICO ||--o| CONTRATO : gera
    SERVICO ||--o{ AGENDAMENTO : possui
    SERVICO ||--o{ PAGAMENTO : recebe
    CLIENTE ||--o{ MENSAGEM : recebe
    SERVICO ||--o{ TAREFA : origina

    MEI { string id string nome string atividade }
    CLIENTE { string id string nome string whatsapp string endereco }
    SERVICO { string id string descricao decimal valor string status date data_prevista }
    ORCAMENTO { string id decimal valor string status date enviado_em }
    CONTRATO { string id text minuta string status }
    AGENDAMENTO { string id datetime inicio string local }
    PAGAMENTO { string id decimal valor string forma string status }
    MENSAGEM { string id text conteudo string status datetime aprovado_em }
    TAREFA { string id string tipo date vencimento string status }
```

</details>

**Estados de um serviço**

`rascunho` → `orçado` → `aguardando resposta` → `confirmado` → `agendado` → `executado` → `pago`

<br/>

## 8. Escopo do MVP

Foco no ciclo completo de atendimento, usando dados cadastrados e de demonstração, sem integrações externas complexas nesta primeira versão.

<table>
<tr>
<th align="left" width="50%">Entra no MVP</th>
<th align="left" width="50%">Fica para depois</th>
</tr>
<tr>
<td valign="top">

- Cadastro de cliente
- Descrição do serviço em linguagem natural
- Geração de orçamento
- Rascunho de mensagem de WhatsApp (copiar e colar, sem envio automático)
- Geração de minuta contratual
- Detecção de propostas pendentes e sugestão de ação comercial
- Aprovação do usuário antes de qualquer ação externa

</td>
<td valign="top">

- Integração real com as APIs do WhatsApp e do Instagram
- Módulo financeiro completo
- Multiusuário e múltiplos MEIs com autenticação
- Assinatura digital de contratos

</td>
</tr>
</table>

<br/>

## 9. Segurança, privacidade e LGPD

| Princípio | Compromisso |
|:---|:---|
| **Aprovação humana** | Obrigatória para envio de mensagens e documentos. |
| **Minimização de dados** | O agente acessa apenas o contexto autorizado do negócio. |
| **LGPD** | Dados pessoais de clientes finais (nome, telefone, endereço) com base legal definida, finalidade clara e possibilidade de exclusão. |
| **Controle de custo e abuso** | Limites de uso e monitoramento do custo de inferência. |
| **Rastreabilidade** | Registro de quais ações o agente propôs e quais o usuário aprovou. |

> [!CAUTION]
> Minutas geradas por IA são ponto de partida. Devem ser revisadas e não substituem orientação jurídica.

#### Como isso está implementado

| O que protege | Como funciona | Onde está |
|:---|:---|:---|
| **Nada sai sem o MEI aprovar** | Orçamento, contrato e mensagem nascem como `rascunho` e só viram `aprovado` ou `descartado` por decisão do usuário no cartão. Decisão repetida não muda nada. No MVP não há envio automático: a mensagem é copiada e colada. | `supabase/04-documentos.sql` (`item_decidir`), `src/app/painel/agente/Cartao.tsx` |
| **Documento aprovado não é refeito** | O banco recusa regerar orçamento ou contrato já aprovado. | `supabase/04-documentos.sql` |
| **Entrada do modelo validada** | Cada uma das 20 ferramentas tem esquema `zod`; entrada inválida não executa e volta ao modelo como `entrada_invalida`. | `src/lib/agente/ferramentas/executar.ts` |
| **Regras de negócio no banco** | A IA interpreta; as funções SQL garantem estados do serviço e evitam cliente duplicado. | `supabase/02..05-*.sql` |
| **Teto de etapas por pedido** | No máximo 8 voltas do modelo por mensagem do usuário. | `src/lib/agente/loop.ts` (`MAX_VOLTAS`) |
| **Teto de custo por dia** | Limite diário de tokens por MEI (padrão 400 mil, `AGENTE_LIMITE_DIARIO_TOKENS`). | `src/lib/agente/uso.ts` |
| **Histórico consistente** | Volta que falha no meio (filtro, corte, erro de rede) não é gravada; a conversa segue utilizável. | `src/lib/agente/loop.ts` |
| **Histórico limitado** | No máximo 40 mensagens ou 40 mil caracteres enviados ao modelo. | `src/lib/agente/llm.ts` (`limitarHistorico`) |
| **Auditoria** | Toda chamada de ferramenta e toda decisão do usuário ficam em `agente_acoes` (entrada, saída, erro, autor), com RLS. | `supabase/06-agente.sql` |
| **Erros compreensíveis** | Toda falha (limite de taxa, conversa longa, filtro, limite do dia) chega ao MEI como mensagem em português, com o que fazer em seguida. | `src/lib/agente/llm.ts`, `src/lib/agente/loop.ts` |

#### Como medimos a qualidade

| Camada | Como | Situação |
|:---|:---|:---|
| **Testes automáticos** | 584 testes (`npm test`) com um LLM falso, que segue um roteiro, e banco PGlite em memória. Cobrem o laço do agente, as ferramentas, as regras SQL, os documentos, a rota do chat, a base de conhecimento e o webhook da Meta, sem gastar crédito. | Passando |
| **Aceitação com o modelo real** | `scripts/agente-smoke.ts` roda o cenário da seção 3 contra o modelo. Esperado: 3 cartões, serviço `confirmado` e nenhuma `entrada_invalida`. | Script pronto |
| **Métricas de produto** | As da seção 11, medidas na fase de validação com MEIs reais. | Fase 2 |

<br/>

## 10. Riscos e gaps

| Tipo | Desafio |
|:---|:---|
| **Técnico** | Arquitetura de agentes, memória contextual confiável, orquestração de ferramentas, custo de inferência e segurança dos dados. |
| **Operacional** | Viabilidade de integração com WhatsApp e Instagram; fluxos simples de aprovação e execução. |
| **Negócio** | Entrevistar MEIs de diferentes segmentos, priorizar tarefas de maior impacto, validar a experiência de uso e investigar disposição a pagar. |
| **Validação** | Medir tempo economizado, facilidade de uso e efetividade do acompanhamento comercial. |

> [!NOTE]
> **Hipótese inicial, a ser testada com usuários reais:** uma ferramenta especializada, simples e integrada à rotina do empreendedor pode reduzir atividades administrativas repetitivas.

<br/>

## 11. Validação

| Métrica | Como medir |
|:---|:---|
| Tempo para gerar orçamento e contrato | Cronometrar antes (manual) e depois (com o agente) |
| Facilidade de uso | Teste com MEIs reais e questionário (ex.: SUS simplificado) |
| Efetividade do follow-up | Percentual de propostas pendentes que receberam resposta após o lembrete sugerido |
| Qualidade dos documentos | Revisão por pessoa com conhecimento jurídico |
| Disposição a pagar | Entrevistas estruturadas por segmento |

<br/>

## 12. Roadmap

| Fase | Entrega |
|:---|:---|
| **1. MVP (hackathon)** | Ciclo completo: cliente → serviço → orçamento → mensagem → minuta → pendências, com dados de demonstração. |
| **2. Validação** | Testes com MEIs reais (eletricistas, técnicos, fotógrafos); ajuste de fluxos e linguagem. |
| **3. Integrações** | WhatsApp e Instagram, com envio após aprovação. |
| **4. Financeiro** | Cobranças, lembretes de pagamento e visão de fluxo de caixa. |
| **5. Escala** | Autenticação, multiusuário, modelo de preço acessível e controle de custos. |

<br/>

## 13. Estrutura do projeto

<details>
<summary><b>Ver as pastas principais</b></summary>
<br/>

```text
MEI-agente-/
├── src/
│   ├── app/
│   │   ├── api/            rotas: chat, cron de pendências, health
│   │   ├── painel/         telas: agente, agenda, clientes, serviços,
│   │   │                   documentos, mensagens, negócio
│   │   ├── login/          entrada
│   │   └── setup/          primeiro acesso
│   └── lib/
│       ├── agente/         laço, prompt, contexto, cliente do modelo, uso
│       │   └── ferramentas/  definições e executor das ferramentas
│       ├── documentos/     orçamento, contrato e formatação
│       ├── dominio/        tipos e regras do MEI
│       └── auth/           sessão, senha e limite de login
├── supabase/               SQL em ordem (01-auth ... 11-fiscal, 90-cron)
│   └── seed/               dados de demonstração
├── tests/                  agente, documentos, domínio e SQL (PGlite)
├── scripts/                smoke HTTP e smoke do agente
└── docs/                   plano de implementação
```

</details>

<br/>

## 14. Como rodar

**1. Banco.** Crie um projeto no Supabase. No SQL Editor, execute, em ordem, os arquivos `supabase/01-auth.sql` a `supabase/11-fiscal.sql`.

> [!TIP]
> O `90-cron.sql` é para o agendamento em produção e não é necessário para rodar localmente: ele usa `pg_cron` e `pg_net` e precisa que você troque `<APP_URL>` e `<CRON_SECRET>` antes de rodar (sem commitar o resultado). Localmente, o botão **Verificar agora** do Início faz o mesmo que o agendamento.

**2. Variáveis.** Copie `.env.example` para `.env.local` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `CRON_SECRET` e `FEATHERLESS_API_KEY`. Use `AGENTE_MODELO=google/gemma-4-31B-it`. A service role key deve ficar apenas no servidor. Não há `APP_URL`.

**3. Aplicação.**

```bash
npm install
npm run dev
```

Abra `http://localhost:3000/setup`, crie seu usuário e complete o cadastro do negócio na tela seguinte.

**4. Demonstração.** Abra `supabase/seed/demo.sql`, substitua `<EMAIL_DO_USUARIO>` pelo email usado em `/setup` e execute o arquivo no SQL Editor. O seed pode ser executado mais de uma vez; ele cria o MEI Refrigeração Bueno, cinco clientes, um serviço pago, um agendamento para amanhã e a proposta #009 de Carlos parada há quatro dias.

Para a demonstração completa, use `supabase/seed/demo-completo.sql`, com **outra conta** (é um MEI por usuário; rodar os dois seeds na mesma conta renomeia o MEI). Ele também troca `<EMAIL_DO_USUARIO>` e pode ser executado mais de uma vez. Cria o MEI fictício Lima Reparos e Climatização com 20 clientes inventados (telefones `62 90000-0001` a `0020`), serviços em todos os status, agenda passada e futura, pagamentos integral e parcial, orçamentos, contratos e mensagens em todos os status, propostas paradas com tarefa aberta, feita e ignorada, memórias e a base de conhecimento (preços, dúvidas frequentes, políticas e notas por cliente) que o agente consulta com `consultar_conhecimento`.

**5. Smoke.** Quando as rotas de chat e agendador estiverem disponíveis, execute `./scripts/smoke.sh` com o servidor local em execução para conferir as respostas HTTP sem sessão.

#### Verificação sem banco real nem chamada ao modelo

```bash
npm test
npm run lint
```

`npm run build` também precisa das variáveis de `.env.local`; valores fictícios bastam para o build local.

<br/>

## 15. O papel do AKCIT Camp

O hackathon é a oportunidade de transformar a proposta em um protótipo tecnicamente consistente e com potencial de aplicação comercial.

| | |
|:---|:---|
| **Capacitações** | Agentes de IA, LLMs, RAG, function calling e orquestração alimentam diretamente a arquitetura e os fluxos do agente. |
| **Entrega alvo** | Uma jornada completa de atendimento, em que o agente interpreta a demanda, usa ferramentas, mantém contexto e sugere próximas ações. |
| **Mentorias** | Avaliação de viabilidade técnica, custos de operação, experiência do usuário e evolução do produto. |
| **Meta de negócio** | Uma solução economicamente acessível para microempreendedores, respeitando as limitações desse público. |

<br/>

## Equipe

O MEIagente nasceu de uma dor real: o Tales, líder técnico da equipe, é MEI e vive a rotina que o produto quer simplificar. As funções abaixo refletem onde cada pessoa mais contribuiu no histórico do repositório.

<table>
<tr>
<td width="25%" valign="top">

**Tales Cavalcanti**<br/>
<sub>Tech Lead · MEI</sub>

Arquitetura do produto e núcleo do agente: laço, ferramentas, prompt, cliente do modelo e base de conhecimento. Integração com a Meta, fundação do app e deploy.

</td>
<td width="25%" valign="top">

**Victor Julius**<br/>
<sub>Backend e banco de dados</sub>

Regras de negócio no SQL: serviços, agenda, pagamentos e máquina de estados; orçamento, contrato e aprovação; detecção de propostas paradas. Lidera o módulo de nota fiscal assistida.

</td>
<td width="25%" valign="top">

**Otávio Leão**<br/>
<sub>Frontend</sub>

Interface do agente: chat com cartões de aprovação, leitura do streaming de eventos, criação de conta e login.

</td>
<td width="25%" valign="top">

**Pedro Henrique**<br/>
<sub>Integração, proatividade e documentação</sub>

Rota de chat com streaming e acompanhamento de propostas paradas. Documentação, pesquisa de dados de mercado e Business Model Canvas.

</td>
</tr>
</table>

<br/>

## Licença

Distribuído sob a licença [MIT](LICENSE).

<br/>

<div align="center">
<sub>Desenvolvido para o AKCIT Camp 2026, Edição Regional Nordeste, Recife.</sub>
</div>
