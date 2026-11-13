import type { Metadata } from "next";
import { lerConversa, listarConversas, type ConversaMensagem } from "@/lib/agente/conversas";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import PageHeader from "../PageHeader";
import Chat, { type Bolha, type ConversaResumo } from "./Chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Agente" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parte = { type?: string; text?: unknown; toolName?: unknown; output?: { type?: unknown } };

/** Partes de uma `ModelMessage`: `content` pode ser texto solto ou lista de partes. */
function partes(content: unknown): Parte[] {
  const c = (content as { content?: unknown } | null)?.content;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return Array.isArray(c) ? (c as Parte[]) : [];
}

function textoDe(content: unknown): string {
  return partes(content)
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

/** O bloco de contexto vai prefixado ao texto do usuário (contexto.ts); na tela, só a fala. */
function semContexto(texto: string): string {
  return texto.replace(/^\s*<contexto_do_negocio>[\s\S]*?<\/contexto_do_negocio>\s*/i, "");
}

/**
 * Histórico gravado → falas da tela. Tudo entre duas mensagens do usuário vira
 * uma bolha só do assistente (texto, ferramentas e cartões do turno), igual
 * ao que a tela monta durante o streaming.
 */
function paraBolhas(linhas: ConversaMensagem[]): Bolha[] {
  const bolhas: Bolha[] = [];
  let atual: Bolha | null = null;

  for (const l of linhas) {
    if (l.role === "user") {
      atual = null;
      bolhas.push({ id: `u-${l.id}`, papel: "usuario", texto: semContexto(textoDe(l.content)), ferramentas: [], cartoes: [] });
      continue;
    }
    if (!atual) {
      atual = { id: `a-${l.id}`, papel: "assistente", texto: "", ferramentas: [], cartoes: [] };
      bolhas.push(atual);
    }
    if (l.role === "assistant") {
      const t = textoDe(l.content);
      if (t) atual.texto = atual.texto ? `${atual.texto}\n\n${t}` : t;
      for (const p of partes(l.content)) {
        if (p.type === "tool-call" && typeof p.toolName === "string") {
          atual.ferramentas.push({ nome: p.toolName, erro: false });
        }
      }
    } else if (l.role === "tool") {
      // Resultado com erro: marca a ferramenta correspondente (mesma ordem).
      const resultados = partes(l.content).filter((p) => p.type === "tool-result");
      const inicio = atual.ferramentas.length - resultados.length;
      resultados.forEach((p, i) => {
        const f = atual!.ferramentas[inicio + i];
        if (f && typeof p.output?.type === "string" && p.output.type.startsWith("error")) f.erro = true;
      });
    }
    for (const c of l.cartoes ?? []) {
      if (!atual.cartoes.some((x) => x.id === c.id)) atual.cartoes.push(c);
    }
  }
  return bolhas;
}

/**
 * Tela do agente. Recarregar reconstrói a conversa e os cartões a partir do
 * banco (`lerConversa`); o estado de cada item vem do próprio cartão, que
 * lê o item atual.
 */
export default async function AgentePage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { mei } = await requireMei();
  const { c } = await searchParams;
  let conversaId = typeof c === "string" && GUID.test(c) ? c : null;

  let conversas: ConversaResumo[] = [];
  let bolhas: Bolha[] = [];
  let erroCarga: string | null = null;

  try {
    conversas = await listarConversas(rpcDb, mei.id);
  } catch (e) {
    console.error("[agente] listarConversas falhou:", e);
    erroCarga = "Não deu pra carregar as conversas agora.";
  }

  if (conversaId) {
    try {
      const linhas = await lerConversa(rpcDb, mei.id, conversaId);
      bolhas = paraBolhas(linhas);
    } catch (e) {
      // Id de outro MEI se comporta como inexistente: começa conversa nova.
      console.error("[agente] lerConversa falhou:", e);
      erroCarga = "Não encontrei essa conversa. Comece uma nova.";
      conversaId = null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        section="Agente"
        title="Agente"
        summary="Conte o que aconteceu no seu dia. O agente organiza, pergunta o que faltar e prepara rascunhos para você aprovar. Nada é enviado sem você."
      />
      <Chat
        key={conversaId ?? "nova"}
        conversas={conversas}
        conversaId={conversaId}
        inicial={bolhas}
        erroCarga={erroCarga}
      />
    </div>
  );
}
