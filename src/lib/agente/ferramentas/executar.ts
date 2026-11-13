// Executor das ferramentas: valida a entrada com o esquema zod, chama a função
// SQL (onde moram as regras) e devolve sempre JSON em texto para o modelo.
// Erro nunca escapa daqui: vira `erro: true` e o turno do agente continua.
import { renderMinuta } from "@/lib/documentos/contrato";
import { valoresDivergentes } from "@/lib/documentos/divergencias";
import { A_PREENCHER } from "@/lib/documentos/formato";
import type { DadosDocumento } from "@/lib/documentos/tipos";
import type { ConhecimentoAchado, Contrato, ItemVisto, Mensagem, Orcamento, Rpc } from "@/lib/dominio/tipos";
import { instantSP } from "@/lib/tz";
import { FERRAMENTAS } from "./definicoes";

/** Item criado como rascunho: a tela mostra o cartão com aprovar/editar/descartar. */
export type Cartao = { tipo: "orcamento" | "contrato" | "mensagem"; id: string };

export type ResultadoFerramenta = { conteudo: string; erro: boolean; cartao?: Cartao };

type Ctx = { rpc: Rpc; meiId: string; hoje: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entrada = Record<string, any>;
type Saida = { valor: unknown; cartao?: Cartao };

const PREFIXO_REGRA = "regra:";

/** Minuta provisória: o `item_ver` só lê item existente, então o contrato nasce antes do texto final. */
const MINUTA_PROVISORIA = "Minuta em preparação.";

const POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]));

/** Lança como as funções SQL lançam, para cair no mesmo caminho de erro de regra. */
function regra(frase: string): never {
  throw new Error(`${PREFIXO_REGRA} ${frase}`);
}

// Campos que só gastam contexto do modelo.
const CAMPOS_OCULTOS = new Set(["mei_id", "criado_em", "atualizado_em", "aprovado_por"]);

function enxuto(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(enxuto);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !CAMPOS_OCULTOS.has(k)));
  }
  return v;
}

const EXECUTORES: Record<string, (ctx: Ctx, e: Entrada) => Promise<Saida>> = {
  async buscar_cliente({ rpc, meiId }, e) {
    return { valor: await rpc("cliente_buscar", { p_mei: meiId, p_termo: e.termo }) };
  },

  async criar_ou_atualizar_cliente({ rpc, meiId }, e) {
    return { valor: await rpc("cliente_salvar", { p_mei: meiId, p_dados: e }) };
  },

  async registrar_servico({ rpc, meiId }, e) {
    return { valor: await rpc("servico_registrar", { p_mei: meiId, p_dados: e }) };
  },

  async atualizar_servico({ rpc, meiId }, { servico_id, ...dados }) {
    return { valor: await rpc("servico_atualizar", { p_mei: meiId, p_id: servico_id, p_dados: dados }) };
  },

  async listar_dados_faltantes({ rpc, meiId }, e) {
    return { valor: await rpc("servico_faltantes", { p_mei: meiId, p_id: e.servico_id }) };
  },

  async listar_servicos({ rpc, meiId }, e) {
    return { valor: await rpc("servico_listar", { p_mei: meiId, p_status: e.status }) };
  },

  async mudar_status_servico({ rpc, meiId }, e) {
    return { valor: await rpc("servico_mudar_status", { p_mei: meiId, p_id: e.servico_id, p_para: e.para }) };
  },

  async gerar_orcamento({ rpc, meiId }, e) {
    const orc = (await rpc("orcamento_gerar", {
      p_mei: meiId,
      p_servico: e.servico_id,
      p_itens: e.itens,
      p_validade: e.validade_dias,
    })) as Orcamento;
    return { valor: orc, cartao: { tipo: "orcamento", id: orc.id } };
  },

  async gerar_minuta_contrato({ rpc, meiId }, e) {
    const salvar = (minuta: string) =>
      rpc("contrato_salvar", { p_mei: meiId, p_servico: e.servico_id, p_minuta: minuta }) as Promise<Contrato>;

    const provisorio = await salvar(MINUTA_PROVISORIA);
    const visto = (await rpc("item_ver", { p_mei: meiId, p_tipo: "contrato", p_id: provisorio.id })) as ItemVisto;
    if (!visto.servico) regra("serviço não encontrado");
    const dados: DadosDocumento = {
      mei: visto.mei,
      cliente: visto.cliente ?? { nome: null, whatsapp: null, endereco: null },
      servico: visto.servico,
      orcamento: visto.orcamento,
    };
    const minuta = renderMinuta(dados, e.clausulas_extras ?? []);
    const ctr = await salvar(minuta);
    // A minuta inteira fica no cartão; para o modelo basta saber o que falta.
    return {
      valor: { id: ctr.id, status: ctr.status, campos_a_preencher: minuta.split(A_PREENCHER).length - 1 },
      cartao: { tipo: "contrato", id: ctr.id },
    };
  },

  async redigir_mensagem({ rpc, meiId }, e) {
    const msg = (await rpc("mensagem_rascunhar", {
      p_mei: meiId,
      p_dados: { ...e, canal: "whatsapp" },
    })) as Mensagem;
    let avisoValores: string[] = [];
    if (msg.servico_id) {
      const visto = (await rpc("item_ver", { p_mei: meiId, p_tipo: "mensagem", p_id: msg.id })) as ItemVisto;
      const valor = visto.servico?.valor;
      if (valor != null) avisoValores = valoresDivergentes(msg.conteudo, valor);
    }
    return {
      valor: avisoValores.length ? { ...msg, aviso_valores: avisoValores } : msg,
      cartao: { tipo: "mensagem", id: msg.id },
    };
  },

  async salvar_rascunho_post({ rpc, meiId }, e) {
    const msg = (await rpc("mensagem_rascunhar", {
      p_mei: meiId,
      p_dados: { canal: "instagram", objetivo: "post", conteudo: e.conteudo },
    })) as Mensagem;
    return { valor: msg, cartao: { tipo: "mensagem", id: msg.id } };
  },

  async agendar_servico({ rpc, meiId }, e) {
    const inicio = instantSP(e.data, e.hora);
    if (!inicio) regra("data ou hora inválida");
    return {
      valor: await rpc("servico_agendar", {
        p_mei: meiId,
        p_id: e.servico_id,
        p_inicio: inicio.toISOString(),
        p_local: e.local ?? null,
      }),
    };
  },

  async consultar_agenda({ rpc, meiId }, e) {
    return { valor: await rpc("agenda_listar", { p_mei: meiId, p_de: e.de, p_ate: e.ate }) };
  },

  async listar_propostas_pendentes({ rpc, meiId }, e) {
    return { valor: await rpc("propostas_pendentes", { p_mei: meiId, p_dias: e.dias_sem_resposta }) };
  },

  async registrar_pagamento({ rpc, meiId }, e) {
    return {
      valor: await rpc("pagamento_registrar", {
        p_mei: meiId,
        p_servico: e.servico_id,
        p_valor: e.valor,
        p_forma: e.forma,
      }),
    };
  },

  async salvar_memoria({ rpc, meiId }, e) {
    // `memoria_salvar` nasce na Task 9 (supabase/06-agente.sql).
    await rpc("memoria_salvar", { p_mei: meiId, p_fato: e.fato });
    return { valor: { ok: true } };
  },

  async consultar_conhecimento({ rpc, meiId }, e) {
    const achados = (await rpc("conhecimento_buscar", {
      p_mei: meiId,
      p_termo: e.termo,
      p_cliente: e.cliente_id,
      p_tipo: e.tipo,
    })) as ConhecimentoAchado[];
    // A relevância só ordena; não vale o contexto do modelo.
    const resultados = achados.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      conteudo: a.conteudo,
      cliente_id: a.cliente_id,
      cliente_nome: a.cliente_nome,
    }));
    if (!resultados.length) {
      return { valor: { resultados, mensagem: "Nada encontrado na base de conhecimento. Não invente: pergunte ao usuário." } };
    }
    return { valor: { resultados } };
  },
};

const json = (v: unknown) => JSON.stringify(v ?? null);

export async function executarFerramenta(ctx: Ctx, nome: string, entrada: unknown): Promise<ResultadoFerramenta> {
  const ferramenta = POR_NOME.get(nome);
  const executor = EXECUTORES[nome];
  if (!ferramenta || !executor) {
    return { conteudo: json({ erro: `ferramenta desconhecida: ${nome}` }), erro: true };
  }

  const validada = ferramenta.esquema.safeParse(entrada ?? {});
  if (!validada.success) {
    const mensagens = validada.error.issues.map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
    );
    return { conteudo: json({ entrada_invalida: mensagens }), erro: true };
  }

  try {
    const { valor, cartao } = await executor(ctx, validada.data);
    const r: ResultadoFerramenta = { conteudo: json(enxuto(valor)), erro: false };
    if (cartao) r.cartao = cartao;
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith(PREFIXO_REGRA)) {
      return { conteudo: json({ erro: msg.slice(PREFIXO_REGRA.length).trim() }), erro: true };
    }
    console.error(`[ferramenta ${nome}]`, e);
    return { conteudo: json({ erro: "erro interno, tente de novo" }), erro: true };
  }
}
