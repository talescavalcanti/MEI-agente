// Tipos do domínio: linhas das tabelas e retornos das funções SQL.

import type { DadosDocumento } from "@/lib/documentos/tipos";

/**
 * Chamada de função SQL por argumentos nomeados, no formato do supabase-js
 * (`db.rpc`): valor solto para função escalar, objeto para função que devolve
 * uma linha, lista para `setof`/`returns table`, `null` para `void`.
 *
 * Erro do banco vira `Error` com a mensagem crua do Postgres (a mesma de
 * `error.message` no supabase-js). Violação de regra começa com `regra:`.
 *
 * Em produção é implementada sobre `db.rpc`; nos testes, sobre o PGlite
 * (`tests/helpers/banco.ts`).
 */
export type Rpc = (nome: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Linha de `meis`: o negócio. Um por usuário. */
export type Mei = {
  id: string;
  user_id: string;
  nome: string;
  atividade: string | null;
  cidade: string | null;
  telefone: string | null;
  chave_pix: string | null;
  /** Data e hora em texto ISO. */
  criado_em: string;
  /** Dados fiscais (08-fiscal.sql). CNPJ só com dígitos. */
  cnpj: string | null;
  inscricao_municipal: string | null;
  /** Município do prestador, para a NFS-e. */
  municipio: string | null;
  /** Código de tributação nacional (cTribNac): 6 dígitos. */
  codigo_tributacao: string | null;
  /** NBS: 9 dígitos. */
  nbs: string | null;
  descricao_padrao_nota: string | null;
};

/** Campos aceitos por `mei_salvar`. Campo ausente não apaga o que já estava. */
export type MeiDados = {
  nome?: string;
  atividade?: string;
  cidade?: string;
  telefone?: string;
  chave_pix?: string;
};

/** Linha de `clientes`. */
export type Cliente = {
  id: string;
  mei_id: string;
  nome: string;
  /** Só dígitos, com DDD e sem o 55 do país (ex.: `62999990000`). */
  whatsapp: string | null;
  endereco: string | null;
  observacoes: string | null;
  /** CPF (11) ou CNPJ (14), só dígitos, com dígitos verificadores conferidos. */
  documento: string | null;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Campos aceitos por `cliente_salvar`. Com `id`, atualiza esse cliente; sem
 * `id`, casa pelo WhatsApp e atualiza, ou cria. Campo ausente não apaga o que
 * já estava.
 */
export type ClienteDados = {
  id?: string;
  nome?: string;
  whatsapp?: string;
  endereco?: string;
  observacoes?: string;
};

/**
 * Estados de um serviço. `orcado` e `aguardando_resposta` vêm do orçamento
 * (gerado e enviado); `agendado` só por `servico_agendar`; `pago` só por
 * `pagamento_registrar`; `cancelado` vale a partir de qualquer estado não pago.
 */
export type ServicoStatus =
  | "rascunho"
  | "orcado"
  | "aguardando_resposta"
  | "confirmado"
  | "agendado"
  | "executado"
  | "pago"
  | "cancelado";

export type FormaPagamento = "pix" | "dinheiro" | "cartao" | "parcelado" | "outro";

/** Linha de `servicos`. */
export type Servico = {
  id: string;
  mei_id: string;
  cliente_id: string;
  /** Sequencial por MEI: 1, 2, 3... */
  numero: number;
  descricao: string;
  valor: number | null;
  /** Data em texto `AAAA-MM-DD`. */
  data_prevista: string | null;
  local: string | null;
  forma_pagamento: FormaPagamento | null;
  status: ServicoStatus;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Campos aceitos por `servico_atualizar`. Campo ausente ou em branco não apaga
 * o que já estava.
 */
export type ServicoDados = {
  descricao?: string;
  valor?: number;
  /** `AAAA-MM-DD`. */
  data_prevista?: string;
  local?: string;
  forma_pagamento?: FormaPagamento;
};

/** Campos aceitos por `servico_registrar`. `fechado: true` nasce `confirmado`. */
export type ServicoNovo = ServicoDados & {
  cliente_id: string;
  descricao: string;
  fechado?: boolean;
};

/** O que `servico_faltantes` pode apontar, sempre nesta ordem. */
export type CampoFaltante =
  | "cliente.whatsapp"
  | "cliente.endereco"
  | "servico.valor"
  | "servico.data_prevista"
  | "servico.forma_pagamento";

/** Linha de `agendamentos`. Um por serviço: reagendar substitui. */
export type Agendamento = {
  id: string;
  mei_id: string;
  servico_id: string;
  /** Data e hora em texto ISO. */
  inicio: string;
  local: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** Linha de `pagamentos`. */
export type Pagamento = {
  id: string;
  mei_id: string;
  servico_id: string;
  valor: number;
  forma: FormaPagamento | null;
  criado_em: string;
};

/** Retorno de `pagamento_registrar`. */
export type PagamentoResultado = {
  pago_total: number;
  restante: number;
  status: ServicoStatus;
};

/** Linha de `servico_listar`: o serviço com o nome e o WhatsApp do cliente. */
export type ServicoListado = Servico & {
  cliente_nome: string;
  cliente_whatsapp: string | null;
};

/** Linha de `agenda_listar`. */
export type AgendaItem = {
  /** Id do agendamento. */
  id: string;
  servico_id: string;
  inicio: string;
  local: string | null;
  numero: number;
  descricao: string;
  status: ServicoStatus;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
};

/**
 * Status de orçamento, contrato e mensagem. Nascem `rascunho`; só o usuário,
 * por botão, aprova ou descarta. `enviado` existe só em mensagem.
 */
export type ItemStatus = "rascunho" | "aprovado" | "descartado" | "enviado";

/** Os três tipos de item que passam por aprovação. */
export type ItemTipo = "orcamento" | "contrato" | "mensagem";

export type ItemDecisaoPedido = "aprovar" | "descartar";

/** Linha do orçamento (`itens` sempre soma `valor`). */
export type OrcamentoItem = { descricao: string; valor: number };

/** Linha de `orcamentos`. Um por serviço. */
export type Orcamento = {
  id: string;
  mei_id: string;
  servico_id: string;
  /** Mesmo número do serviço. */
  numero: number;
  valor: number;
  itens: OrcamentoItem[];
  validade_dias: number;
  status: Exclude<ItemStatus, "enviado">;
  aprovado_em: string | null;
  aprovado_por: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** Linha de `contratos`. Um por serviço. */
export type Contrato = {
  id: string;
  mei_id: string;
  servico_id: string;
  minuta: string;
  status: Exclude<ItemStatus, "enviado">;
  aprovado_em: string | null;
  aprovado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type MensagemCanal = "whatsapp" | "instagram";

export type MensagemObjetivo = "confirmacao" | "envio_orcamento" | "lembrete" | "cobranca" | "post" | "outro" | "envio_nota";

/** Linha de `mensagens`. */
export type Mensagem = {
  id: string;
  mei_id: string;
  cliente_id: string | null;
  servico_id: string | null;
  canal: MensagemCanal;
  objetivo: MensagemObjetivo;
  /** De 1 a 2000 caracteres. */
  conteudo: string;
  status: ItemStatus;
  aprovado_em: string | null;
  aprovado_por: string | null;
  enviado_em: string | null;
  tarefa_id: string | null;
  /** Nota enviada (objetivo `envio_nota`): sempre nota emitida do mesmo cliente. */
  nota_id: string | null;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Campos aceitos por `mensagem_rascunhar`. Com `servico_id` e sem
 * `cliente_id`, o cliente é o do serviço.
 */
export type MensagemNova = {
  canal: MensagemCanal;
  objetivo: MensagemObjetivo;
  conteudo: string;
  cliente_id?: string;
  servico_id?: string;
  tarefa_id?: string;
  /** Obrigatório com `envio_nota`; sem `cliente_id`, o cliente é o da nota. */
  nota_id?: string;
};

/**
 * Campos aceitos por `item_editar`, conforme o tipo. Orçamento: campo ausente
 * mantém o que estava; a soma dos itens precisa dar o valor do orçamento.
 */
export type ItemEdicao =
  | { conteudo: string }
  | { minuta: string }
  | { itens?: OrcamentoItem[]; validade_dias?: number };

/**
 * Retorno de `item_decidir`. Item fora de `rascunho` não muda (`mudou: false`)
 * e volta com o status atual: clique duplo ou decisão repetida é inofensivo.
 */
export type ItemDecisao = {
  tipo: ItemTipo;
  id: string;
  status: ItemStatus;
  mudou: boolean;
};

/**
 * Retorno de `item_ver`: o item mais os dados no formato `DadosDocumento`
 * (para o cartão e a impressão). `cliente` e `servico` são `null` em mensagem
 * sem cliente/serviço; `orcamento` é `null` se o serviço não tiver orçamento.
 */
export type ItemVisto = {
  item: Orcamento | Contrato | Mensagem;
  mei: DadosDocumento["mei"];
  cliente: DadosDocumento["cliente"] | null;
  servico: DadosDocumento["servico"] | null;
  orcamento: NonNullable<DadosDocumento["orcamento"]> | null;
};

export type TarefaTipo = "follow_up_orcamento" | "emitir_nota" | "corrigir_nota";

export type TarefaStatus = "aberta" | "feita" | "ignorada";

/** Linha de `tarefas`. No máximo uma `aberta` por serviço e tipo. */
export type Tarefa = {
  id: string;
  mei_id: string;
  servico_id: string;
  tipo: TarefaTipo;
  /** Data (AAAA-MM-DD, America/Sao_Paulo) em que a tarefa venceu. */
  vencimento: string;
  status: TarefaStatus;
  criado_em: string;
};

/**
 * Linha de `propostas_pendentes`: serviço `aguardando_resposta` com orçamento
 * enviado há `p_dias` ou mais. `tarefa_id` é a tarefa aberta, se houver.
 */
export type PropostaPendente = {
  servico_id: string;
  numero: number;
  descricao: string;
  valor: number | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  enviado_em: string;
  /** Dias desde o envio, contados pela data de hoje em America/Sao_Paulo. */
  dias_parado: number;
  tarefa_id: string | null;
};

/** Linha de `tarefas_gerar_followups`: só as tarefas criadas nesta rodada. */
export type FollowupGerado = {
  mei_id: string;
  tarefa_id: string;
  servico_id: string;
};

// ---------------------------------------------------------------------------
// Nota fiscal assistida e faturamento (08-fiscal.sql)
// ---------------------------------------------------------------------------

/** Retorno de `fiscal_parametros(p_ano)`. O limite muda por ano (LC 238/2026). */
export type FiscalParametros = {
  ano: number;
  limite_anual: number;
  /** Fração acima do limite que ainda não desenquadra retroativamente (0.2). */
  tolerancia_excesso: number;
  dias_para_emitir: number;
  dias_duplicata: number;
};

/** Campos aceitos por `mei_dados_fiscais_salvar`. Campo ausente não apaga. */
export type MeiDadosFiscais = {
  cnpj?: string;
  inscricao_municipal?: string;
  municipio?: string;
  /** Aceita pontos (`14.01.01`); gravado com 6 dígitos. */
  codigo_tributacao?: string;
  /** Aceita pontos (`1.2001.81.00`); gravado com 9 dígitos. */
  nbs?: string;
  descricao_padrao_nota?: string;
};

export type NotaStatus = "rascunho" | "aprovado" | "emitida" | "divergente" | "descartado" | "cancelada";

export type NotaAvisoCodigo =
  | "municipio_diferente"
  | "possivel_duplicata"
  | "limite_90"
  | "limite_100"
  | "pagamento_diferente";

/** Aviso que exige confirmação antes de aprovar. */
export type NotaAviso = { codigo: NotaAvisoCodigo; texto: string };

/** Campo conferido entre o rascunho e a nota emitida. */
export type NotaCampoConferido = "valor" | "tomador_documento" | "competencia" | "codigo_tributacao";

/** `{campo: {esperado, emitido}}`, só com os campos que diferem. */
export type NotaDiferencas = Partial<
  Record<NotaCampoConferido, { esperado: string | number | null; emitido: string | number | null }>
>;

/** Linha de `notas_fiscais`. */
export type NotaFiscal = {
  id: string;
  mei_id: string;
  servico_id: string;
  cliente_id: string;
  /** Sequencial por MEI: 1, 2, 3... (não é o número da NFS-e). */
  numero_seq: number;
  valor: number;
  parcial: boolean;
  /** `AAAA-MM-DD` */
  competencia: string;
  descricao: string;
  codigo_tributacao: string;
  nbs: string | null;
  municipio_prestacao: string | null;
  tomador_documento: string;
  avisos: NotaAviso[];
  avisos_confirmados: boolean;
  status: NotaStatus;
  aprovado_em: string | null;
  aprovado_por: string | null;
  emitida_em: string | null;
  numero_nfse: string | null;
  chave_acesso: string | null;
  conferencia: NotaDiferencas | null;
  criado_em: string;
  atualizado_em: string;
};

/** Retorno de `nota_decidir`: mesmo contrato do `item_decidir`. */
export type NotaDecisao = { id: string; status: NotaStatus; mudou: boolean };

/** Dados da nota emitida para `nota_registrar_emissao` (do XML ou digitados). */
export type NotaEmissaoDados = {
  numero_nfse: string;
  chave_acesso?: string;
  valor?: number;
  tomador_documento?: string;
  /** `AAAA-MM-DD` */
  competencia?: string;
  codigo_tributacao?: string;
};

/** Retorno de `nota_registrar_emissao`. */
export type NotaEmissaoResultado = {
  status: "emitida" | "divergente";
  diferencas: NotaDiferencas;
};

/** Retorno de `nota_ver`. `mei` vem sem `user_id`. */
export type NotaVista = {
  nota: NotaFiscal;
  mei: Omit<Mei, "user_id">;
  cliente: Cliente;
  servico: Servico;
};

/** Linha de `notas_listar`. */
export type NotaListada = NotaFiscal & {
  cliente_nome: string;
  servico_numero: number;
};

export type FaixaFaturamento = "ok" | "atencao" | "alerta" | "excedido" | "excedido_grave";

/** Retorno de `faturamento_ano`. */
export type FaturamentoAno = {
  ano: number;
  /** Soma dos pagamentos recebidos no ano (America/Sao_Paulo). */
  total: number;
  /** Parte coberta por notas emitidas com competência no ano. */
  com_nota: number;
  sem_nota: number;
  limite: number;
  /** Total / limite, em %, com uma casa. */
  percentual: number;
  /** Projeção linear até 31/12 no ano corrente; ano fechado = total. */
  projecao: number;
  faixa: FaixaFaturamento;
};

/** Linha de `tarefas_gerar_notas`: só as tarefas criadas nesta rodada. */
export type NotaTarefaGerada = {
  mei_id: string;
  tarefa_id: string;
  servico_id: string;
};
