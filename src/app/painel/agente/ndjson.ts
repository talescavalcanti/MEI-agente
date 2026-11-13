// Leitura do corpo de `POST /api/chat`: NDJSON, uma linha por `Evento`.
// Puro (sem React, sem servidor): roda no navegador e nos testes.

import type { Evento } from "@/lib/agente/tipos";

export type { Evento };

const TIPOS = new Set(["texto", "ferramenta", "cartao", "fim", "erro"]);

const ERRO_LEITURA: Evento = {
  tipo: "erro",
  mensagem: "Recebi uma resposta que não consegui ler. Tente de novo.",
};

/** Uma linha do NDJSON → evento. Nunca lança: o que não dá para ler vira `erro`. */
function interpretar(linha: string): Evento {
  try {
    const v: unknown = JSON.parse(linha);
    if (v && typeof v === "object" && TIPOS.has((v as { tipo?: unknown }).tipo as string)) {
      return v as Evento;
    }
  } catch {
    // cai no erro abaixo
  }
  return ERRO_LEITURA;
}

/**
 * Eventos do corpo da resposta, na ordem em que chegam. Linha partida entre
 * dois pedaços é remontada (inclusive caractere acentuado partido no meio);
 * linha vazia é ignorada; JSON inválido vira `{ tipo: "erro" }` sem lançar.
 */
export async function* lerEventos(body: ReadableStream<Uint8Array>): AsyncGenerator<Evento> {
  const leitor = body.getReader();
  const dec = new TextDecoder();
  let resto = "";
  try {
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      let quebra: number;
      while ((quebra = resto.indexOf("\n")) >= 0) {
        const linha = resto.slice(0, quebra).trim();
        resto = resto.slice(quebra + 1);
        if (linha) yield interpretar(linha);
      }
    }
    resto += dec.decode();
    const ultima = resto.trim();
    if (ultima) yield interpretar(ultima);
  } finally {
    leitor.releaseLock();
  }
}
