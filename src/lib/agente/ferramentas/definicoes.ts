// Ferramentas que o modelo pode chamar. O esquema zod é a única fonte da
// verdade: o `llm.ts` converte para o formato do provedor e o executor valida a
// entrada com ele. Descrições curtas de propósito: o modelo tem 32k de contexto.
//
// Não existe ferramenta de envio: o modelo só cria rascunhos (README §8).
import { z } from "zod";

export type Ferramenta = {
  nome: string;
  descricao: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  esquema: z.ZodObject<any>;
};

// Id validado aqui (texto que não é uuid quebraria o cast no SQL como erro
// interno), mas por `refine`, que não vai para o JSON Schema: o padrão de uuid
// repetido em cada id só gastaria contexto do modelo.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (o: string) => z.string().refine((v) => GUID.test(v), `${o} inválido`);
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const formaPagamento = z.enum(["pix", "dinheiro", "cartao", "parcelado", "outro"]);
const statusServico = z.enum([
  "rascunho",
  "orcado",
  "aguardando_resposta",
  "confirmado",
  "agendado",
  "executado",
  "pago",
  "cancelado",
]);

/** Campos do serviço que podem ser preenchidos ou corrigidos depois. */
const camposServico = {
  descricao: z.string().optional(),
  valor: z.number().optional().describe("Em reais"),
  data_prevista: data.optional(),
  local: z.string().optional(),
  forma_pagamento: formaPagamento.optional(),
};

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "buscar_cliente",
    descricao: "Busca clientes por nome ou telefone (máx. 10).",
    esquema: z.object({ termo: z.string().min(1) }),
  },
  {
    nome: "criar_ou_atualizar_cliente",
    descricao: "Cria cliente ou atualiza (por id ou WhatsApp). Campo omitido não apaga o atual.",
    esquema: z.object({
      id: id("id").optional(),
      nome: z.string().optional(),
      whatsapp: z.string().optional(),
      endereco: z.string().optional(),
      observacoes: z.string().optional(),
    }),
  },
  {
    nome: "registrar_servico",
    descricao: "Registra serviço de um cliente. fechado=true se o cliente já confirmou.",
    esquema: z.object({
      cliente_id: id("cliente_id"),
      ...camposServico,
      descricao: z.string().min(1),
      fechado: z.boolean(),
    }),
  },
  {
    nome: "atualizar_servico",
    descricao: "Completa ou corrige dados de um serviço. Campo omitido não muda.",
    esquema: z.object({ servico_id: id("servico_id"), ...camposServico }),
  },
  {
    nome: "listar_dados_faltantes",
    descricao: "Lista o que falta no serviço e no cliente para orçamento e contrato.",
    esquema: z.object({ servico_id: id("servico_id") }),
  },
  {
    nome: "listar_servicos",
    descricao: "Lista serviços, opcionalmente por status.",
    esquema: z.object({ status: statusServico.optional() }),
  },
  {
    nome: "mudar_status_servico",
    descricao: "Muda o status do serviço: confirmado, executado ou cancelado.",
    esquema: z.object({
      servico_id: id("servico_id"),
      para: z.enum(["confirmado", "executado", "cancelado"]),
    }),
  },
  {
    nome: "gerar_orcamento",
    descricao: "Gera rascunho de orçamento do serviço. Itens, se vierem, somam o valor do serviço.",
    esquema: z.object({
      servico_id: id("servico_id"),
      itens: z.array(z.object({ descricao: z.string().min(1), valor: z.number() })).optional(),
      validade_dias: z.number().int().optional(),
    }),
  },
  {
    nome: "gerar_minuta_contrato",
    descricao: "Gera rascunho de minuta de contrato do serviço com os dados do cadastro.",
    esquema: z.object({
      servico_id: id("servico_id"),
      clausulas_extras: z.array(z.string().min(1)).optional(),
    }),
  },
  {
    nome: "redigir_mensagem",
    descricao: "Cria rascunho de mensagem de WhatsApp para o cliente. Não envia.",
    esquema: z.object({
      cliente_id: id("cliente_id"),
      servico_id: id("servico_id").optional(),
      objetivo: z.enum(["confirmacao", "envio_orcamento", "lembrete", "cobranca", "outro"]),
      conteudo: z.string().min(1).max(2000),
      tarefa_id: id("tarefa_id").optional(),
    }),
  },
  {
    nome: "salvar_rascunho_post",
    descricao: "Salva rascunho de post para o Instagram. Não publica.",
    esquema: z.object({ conteudo: z.string().min(1).max(2000) }),
  },
  {
    nome: "agendar_servico",
    descricao: "Agenda (ou reagenda) serviço confirmado. Horário de Brasília.",
    esquema: z.object({
      servico_id: id("servico_id"),
      data,
      hora: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM"),
      local: z.string().optional(),
    }),
  },
  {
    nome: "consultar_agenda",
    descricao: "Lista agendamentos entre duas datas.",
    esquema: z.object({ de: data, ate: data }),
  },
  {
    nome: "listar_propostas_pendentes",
    descricao: "Lista orçamentos enviados sem resposta há N dias (padrão 3).",
    esquema: z.object({ dias_sem_resposta: z.number().int().optional() }),
  },
  {
    nome: "registrar_pagamento",
    descricao: "Registra pagamento recebido de um serviço.",
    esquema: z.object({
      servico_id: id("servico_id"),
      valor: z.number().describe("Em reais"),
      forma: formaPagamento,
    }),
  },
  {
    nome: "salvar_memoria",
    descricao: "Guarda um fato duradouro sobre o negócio para lembrar depois.",
    esquema: z.object({ fato: z.string().min(1) }),
  },
  {
    nome: "consultar_conhecimento",
    descricao: "Busca no histórico de clientes, preços, dúvidas frequentes e políticas do negócio.",
    esquema: z.object({
      termo: z.string().min(1),
      cliente_id: id("cliente_id").optional(),
      tipo: z.enum(["nota_cliente", "atendimento", "preco", "faq", "politica"]).optional(),
    }),
  },
];
