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

export type MensagemObjetivo = "confirmacao" | "envio_orcamento" | "lembrete" | "cobranca" | "post" | "outro";

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
