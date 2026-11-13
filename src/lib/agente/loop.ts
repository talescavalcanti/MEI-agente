// Laço do agente: um turno do usuário, com até MAX_VOLTAS voltas do modelo.
//
// Regras que mantêm a conversa sempre utilizável (Review Focus 4):
// - A mensagem do usuário é gravada antes de chamar o modelo.
// - Volta com ferramentas: executa todas as chamadas e grava, numa operação
//   só, as mensagens do assistente e a mensagem com todos os resultados. O
//   histórico nunca fica com chamada sem resultado.
// - Volta que termina mal (filtro, corte por tamanho, motivo desconhecido,
//   teto de voltas, exceção do modelo) não é gravada e não executa nada:
//   o histórico fica como estava antes dela.
// - As mensagens do modelo são gravadas e reenviadas sem alteração; o laço
//   nunca monta mensagem de provedor à mão (quem monta é o `Llm`).

import type { ModelMessage } from "ai";
import type { Rpc } from "@/lib/dominio/tipos";
import { anexarMensagens, criarConversa, historico, lerConversa, registrarAcao, tituloDe } from "./conversas";
import { FERRAMENTAS } from "./ferramentas/definicoes";
import { executarFerramenta, type Cartao } from "./ferramentas/executar";
import type { Evento, Llm } from "./tipos";
import { limiteAtingido, somarUso } from "./uso";

export type { Chamada, Evento, Llm, Motivo } from "./tipos";

/** Teto de voltas do modelo por turno (controle de custo, README §9). */
export const MAX_VOLTAS = 8;

export const ERRO_LIMITE_DIARIO = "Você atingiu o limite de uso de hoje.";
const ERRO_FILTRO = "A resposta foi bloqueada pelo filtro de conteúdo do modelo. Tente dizer de outro jeito.";
const ERRO_TAMANHO = "A resposta ficou longa demais e foi cortada. Tente pedir uma coisa de cada vez.";
const ERRO_OUTRO = "O modelo parou sem terminar a resposta. Tente de novo.";
const ERRO_VOLTAS = "Parei depois de muitas etapas seguidas. Diga como quer continuar.";
const ERRO_INTERNO = "Algo deu errado do nosso lado. Tente de novo.";

export type DepsTurno = {
  rpc: Rpc;
  llm: Llm;
  meiId: string;
  /** Hoje em America/Sao_Paulo, `AAAA-MM-DD` (para as ferramentas). */
  hoje: string;
  system: string;
  /** Tokens por dia (entrada + saída). */
  limiteDiario: number;
};

export type EntradaTurno = {
  /** `null` cria uma conversa nova. */
  conversaId: string | null;
  texto: string;
  origem?: "chat" | "agendador";
};

/** Erro que veio do modelo: a mensagem já é para o usuário (llm.ts). */
class ErroDoModelo extends Error {}

/**
 * Roda um turno. Nunca lança: falha vira evento `erro`. Quando há conversa
 * válida, o turno termina com `fim` (também depois de `erro`).
 *
 * Devolve o id da conversa; vazio só quando nenhuma conversa existe (limite
 * diário atingido numa conversa nova, conversa de outro MEI, banco fora).
 */
export async function rodarTurno(
  deps: DepsTurno,
  entrada: EntradaTurno,
  emitir: (e: Evento) => void,
): Promise<{ conversaId: string }> {
  const emit = (e: Evento) => {
    try {
      emitir(e);
    } catch {
      // Quem ouve caiu (ex.: cliente desconectou). O turno segue e grava tudo.
    }
  };

  let conversaId: string | null = null;
  try {
    conversaId = await turno(deps, entrada, emit, (id) => (conversaId = id));
  } catch (e) {
    emit({ tipo: "erro", mensagem: mensagemDeErro(e) });
  }
  if (conversaId) emit({ tipo: "fim", conversaId });
  return { conversaId: conversaId ?? "" };
}

async function turno(
  deps: DepsTurno,
  entrada: EntradaTurno,
  emit: (e: Evento) => void,
  definirConversa: (id: string) => void,
): Promise<string | null> {
  const { rpc, llm, meiId } = deps;

  let mensagens: ModelMessage[] = [];
  let conversaId = entrada.conversaId;
  if (conversaId) {
    // Também confere que a conversa é deste MEI.
    mensagens = historico(await lerConversa(rpc, meiId, conversaId));
    definirConversa(conversaId);
  }

  if (await limiteAtingido(rpc, meiId, deps.limiteDiario)) {
    emit({ tipo: "erro", mensagem: ERRO_LIMITE_DIARIO });
    return conversaId;
  }

  if (!conversaId) {
    conversaId = (await criarConversa(rpc, meiId, { origem: entrada.origem ?? "chat", titulo: tituloDe(entrada.texto) })).id;
    definirConversa(conversaId);
  }

  const usuario: ModelMessage = { role: "user", content: entrada.texto };
  await anexarMensagens(rpc, meiId, conversaId, [{ mensagem: usuario }]);
  mensagens.push(usuario);

  const ctx = { rpc, meiId, hoje: deps.hoje };

  for (let volta = 1; volta <= MAX_VOLTAS; volta++) {
    let r: Awaited<ReturnType<Llm["turno"]>>;
    try {
      r = await llm.turno({ system: deps.system, mensagens: [...mensagens], ferramentas: FERRAMENTAS }, (delta) => {
        if (delta) emit({ tipo: "texto", delta });
      });
    } catch (e) {
      throw new ErroDoModelo(e instanceof Error ? e.message : String(e), { cause: e });
    }
    await somarUso(rpc, meiId, r.uso);

    // Decide pelo que veio, não só pelo motivo: há provedor que devolve
    // `stop` com chamadas. Chamada gravada sem resultado quebraria a conversa.
    const temChamadas = r.chamadas.length > 0;
    const ok = r.motivo === "fim" || r.motivo === "ferramentas";
    if (!ok) {
      emit({ tipo: "erro", mensagem: erroDoMotivo(r.motivo) });
      return conversaId;
    }

    if (!temChamadas) {
      await anexarMensagens(rpc, meiId, conversaId, r.mensagens.map((m) => ({ mensagem: m })));
      return conversaId;
    }

    if (volta === MAX_VOLTAS) {
      emit({ tipo: "erro", mensagem: ERRO_VOLTAS });
      return conversaId;
    }

    // Executa em ordem (uma chamada pode depender do efeito da anterior no banco).
    const itens: { id: string; nome: string; conteudo: string; erro: boolean }[] = [];
    const cartoes: Cartao[] = [];
    const acoes: Parameters<typeof registrarAcao>[2][] = [];
    for (const c of r.chamadas) {
      const res = await executarFerramenta(ctx, c.nome, c.entrada);
      itens.push({ id: c.id, nome: c.nome, conteudo: res.conteudo, erro: res.erro });
      if (res.cartao) cartoes.push(res.cartao);
      acoes.push({
        conversaId,
        tipo: "ferramenta",
        nome: c.nome,
        entrada: c.entrada,
        saida: { conteudo: jsonOuTexto(res.conteudo), ...(res.cartao ? { cartao: res.cartao } : {}) },
        erro: res.erro,
      });
      emit({ tipo: "ferramenta", nome: c.nome, erro: res.erro });
      if (res.cartao) emit({ tipo: "cartao", cartao: res.cartao });
    }

    const resultado = llm.resultado(itens);
    // Os cartões ficam na mensagem do assistente que pediu as ferramentas
    // (a última do assistente nesta volta).
    const ultimaAssistente = r.mensagens.findLastIndex((m) => m.role === "assistant");
    await anexarMensagens(rpc, meiId, conversaId, [
      ...r.mensagens.map((m, i) => ({ mensagem: m, cartoes: i === ultimaAssistente ? cartoes : null })),
      { mensagem: resultado },
    ]);
    for (const a of acoes) await registrarAcao(rpc, meiId, a);

    mensagens = [...mensagens, ...r.mensagens, resultado];
  }

  return conversaId;
}

function erroDoMotivo(motivo: string): string {
  if (motivo === "filtro") return ERRO_FILTRO;
  if (motivo === "limite") return ERRO_TAMANHO;
  return ERRO_OUTRO;
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDoModelo) return e.message || ERRO_OUTRO;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("regra:")) return msg.slice("regra:".length).trim();
  console.error("[agente]", e);
  return ERRO_INTERNO;
}

function jsonOuTexto(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
