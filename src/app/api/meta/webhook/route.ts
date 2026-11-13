import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { rpcDb } from "@/lib/dominio/mei";
import { assinaturaValida } from "@/lib/meta/assinatura";
import { extrairMensagens } from "@/lib/meta/eventos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook da Meta (Instagram Direct e WhatsApp Cloud API). Por enquanto só
 * RECEBE: guarda cada mensagem no MEI dono da conta (`canais_conectados`) e
 * não responde nada ao cliente. Sem login: o proxy deixa passar /api/*; quem
 * protege é o token do handshake e a assinatura do corpo.
 *
 * Sem `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` a integração fica
 * desligada (403 no handshake, 503 nos eventos).
 */

const SEM_CACHE = { "Cache-Control": "no-store" };

function texto(corpo: string, status: number): Response {
  return new Response(corpo, { status, headers: { ...SEM_CACHE, "Content-Type": "text/plain; charset=utf-8" } });
}

/** Igualdade de strings em tempo constante (digests de mesmo tamanho). */
function iguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Handshake de verificação: a Meta chama com `hub.mode=subscribe`,
 * `hub.verify_token` e `hub.challenge`, e espera o challenge de volta em texto.
 */
export async function GET(request: Request): Promise<Response> {
  const p = new URL(request.url).searchParams;
  const token = env.metaWebhookVerifyToken;
  if (!token || p.get("hub.mode") !== "subscribe" || !iguais(p.get("hub.verify_token") ?? "", token)) {
    return texto("Forbidden", 403);
  }
  return texto(p.get("hub.challenge") ?? "", 200);
}

/**
 * Eventos. A assinatura `X-Hub-Signature-256` é conferida sobre o corpo CRU,
 * antes do JSON. Depois disso a resposta é sempre 200: a Meta reenvia o
 * evento quando não recebe 200, e o reenvio não duplica (unique por
 * `externo_id` no banco). Erro de banco fica no log.
 */
export async function POST(request: Request): Promise<Response> {
  const segredo = env.metaAppSecret;
  if (!segredo) return texto("Webhook da Meta não configurado", 503);

  const cru = await request.text();
  if (!assinaturaValida(cru, request.headers.get("x-hub-signature-256"), segredo)) {
    return texto("Invalid signature", 401);
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return texto("Bad JSON", 400);
  }

  for (const m of extrairMensagens(corpo)) {
    try {
      await rpcDb("mensagem_recebida_registrar", { p_canal: m.canal, p_dados: m });
    } catch (e) {
      // Só ids no log: o conteúdo da mensagem é dado do cliente do MEI.
      console.error(
        `meta webhook: falha ao gravar ${m.canal} ${m.externo_id} (conta ${m.conta_id}):`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return texto("EVENT_RECEIVED", 200);
}
