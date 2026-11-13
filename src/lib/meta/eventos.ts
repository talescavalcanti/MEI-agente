/**
 * Leitura do corpo do webhook da Meta (Instagram Direct e WhatsApp Cloud API)
 * para uma lista plana de mensagens recebidas, no formato que
 * `mensagem_recebida_registrar` (supabase/09-meta.sql) espera em `p_dados`.
 *
 * Só mensagens de clientes entram. Eco da própria conta, mensagem apagada,
 * reação, confirmação de leitura e status de entrega ficam de fora. Corpo fora
 * do formato não lança: vira lista vazia (o webhook responde 200 mesmo assim).
 */

export type CanalMeta = "instagram" | "whatsapp";

export type MensagemRecebida = {
  canal: CanalMeta;
  /** Conta que recebeu: id da conta profissional (Instagram) ou phone_number_id (WhatsApp). */
  conta_id: string;
  /** IGSID no Instagram, número (wa_id) no WhatsApp. */
  remetente_id: string;
  remetente_nome: string | null;
  /** mid (Instagram) ou wamid (WhatsApp). */
  externo_id: string;
  /** Null quando a mensagem é só anexo. */
  conteudo: string | null;
  tipo: "texto" | "anexo" | "outro";
  /** ISO 8601. */
  recebida_em: string;
};

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/** Ids da Meta chegam como string, mas número não deve derrubar a leitura. */
const id = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Data a partir de epoch (ms ou s); inválida vira agora. */
function iso(valor: unknown, escala: 1 | 1000): string {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) {
    const d = new Date(n * escala);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function extrairMensagens(corpo: unknown): MensagemRecebida[] {
  const raiz = obj(corpo);
  if (!raiz) return [];
  if (raiz.object === "instagram") return instagram(raiz);
  if (raiz.object === "whatsapp_business_account") return whatsapp(raiz);
  return [];
}

// ---------------------------------------------------------------------------
// Instagram: entry[].messaging[], timestamp em milissegundos
// ---------------------------------------------------------------------------

function instagram(raiz: Obj): MensagemRecebida[] {
  const saida: MensagemRecebida[] = [];
  for (const e of lista(raiz.entry)) {
    const entrada = obj(e);
    if (!entrada) continue;
    for (const ev of lista(entrada.messaging)) {
      const evento = obj(ev);
      const msg = obj(evento?.message);
      if (!evento || !msg) continue; // reação, leitura, postback: fora
      if (msg.is_echo === true || msg.is_deleted === true) continue;

      const conta = id(obj(evento.recipient)?.id) ?? id(entrada.id);
      const remetente = id(obj(evento.sender)?.id);
      const externo = id(msg.mid);
      if (!conta || !remetente || !externo) continue;

      const conteudo = texto(msg.text);
      const anexos = lista(msg.attachments);
      saida.push({
        canal: "instagram",
        conta_id: conta,
        remetente_id: remetente,
        remetente_nome: null,
        externo_id: externo,
        conteudo,
        tipo: conteudo !== null ? "texto" : anexos.length > 0 ? "anexo" : "outro",
        recebida_em: iso(evento.timestamp ?? entrada.time, 1),
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// WhatsApp: entry[].changes[field=messages].value, timestamp em segundos
// ---------------------------------------------------------------------------

const MIDIAS = new Set(["image", "video", "audio", "document", "sticker"]);

function whatsapp(raiz: Obj): MensagemRecebida[] {
  const saida: MensagemRecebida[] = [];
  for (const e of lista(raiz.entry)) {
    for (const c of lista(obj(e)?.changes)) {
      const mudanca = obj(c);
      if (!mudanca || mudanca.field !== "messages") continue;
      const valor = obj(mudanca.value);
      const conta = id(obj(valor?.metadata)?.phone_number_id);
      if (!valor || !conta) continue;

      const nomes = new Map<string, string>();
      for (const ct of lista(valor.contacts)) {
        const contato = obj(ct);
        const waId = id(contato?.wa_id);
        const nome = texto(obj(contato?.profile)?.name);
        if (waId && nome) nomes.set(waId, nome);
      }

      // `statuses` (enviada, entregue, lida) não é mensagem recebida: fica de fora.
      for (const m of lista(valor.messages)) {
        const msg = obj(m);
        const remetente = id(msg?.from);
        const externo = id(msg?.id);
        if (!msg || !remetente || !externo) continue;
        if (msg.type === "reaction") continue;

        const { conteudo, tipo } = conteudoWhatsapp(msg);
        saida.push({
          canal: "whatsapp",
          conta_id: conta,
          remetente_id: remetente,
          remetente_nome: nomes.get(remetente) ?? null,
          externo_id: externo,
          conteudo,
          tipo,
          recebida_em: iso(msg.timestamp, 1000),
        });
      }
    }
  }
  return saida;
}

function conteudoWhatsapp(msg: Obj): Pick<MensagemRecebida, "conteudo" | "tipo"> {
  const tipo = typeof msg.type === "string" ? msg.type : "";
  if (tipo === "text") {
    const conteudo = texto(obj(msg.text)?.body);
    return { conteudo, tipo: conteudo !== null ? "texto" : "outro" };
  }
  if (MIDIAS.has(tipo)) {
    return { conteudo: texto(obj(msg[tipo])?.caption), tipo: "anexo" };
  }
  if (tipo === "button") {
    const conteudo = texto(obj(msg.button)?.text);
    return { conteudo, tipo: conteudo !== null ? "texto" : "outro" };
  }
  if (tipo === "interactive") {
    const i = obj(msg.interactive);
    const conteudo = texto(obj(i?.button_reply)?.title) ?? texto(obj(i?.list_reply)?.title);
    return { conteudo, tipo: conteudo !== null ? "texto" : "outro" };
  }
  return { conteudo: null, tipo: "outro" };
}
