import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere o cabeçalho `X-Hub-Signature-256` que a Meta manda em todo POST do
 * webhook: `sha256=<hex>` do HMAC-SHA256 do corpo CRU com o App Secret.
 *
 * O corpo tem que ser exatamente os bytes recebidos (ler com `req.text()`
 * antes de qualquer `JSON.parse`). Comparação em tempo constante; segredo
 * vazio recusa tudo (sem segredo, qualquer um assinaria com string vazia).
 */
export function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): boolean {
  if (!segredo || !cabecalho) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(cabecalho.trim());
  if (!m) return false;

  const recebido = Buffer.from(m[1].toLowerCase(), "hex");
  const esperado = createHmac("sha256", segredo).update(corpo, "utf8").digest();
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}
