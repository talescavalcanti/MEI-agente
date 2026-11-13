import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaValida } from "@/lib/meta/assinatura";

const SEGREDO = "segredo-do-app";
const CORPO = '{"object":"instagram","entry":[]}';
const assinar = (corpo: string, segredo = SEGREDO) =>
  "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

describe("assinaturaValida", () => {
  it("aceita o HMAC-SHA256 do corpo cru com o App Secret", () => {
    expect(assinaturaValida(CORPO, assinar(CORPO), SEGREDO)).toBe(true);
  });

  it("aceita o hex em maiúsculas", () => {
    expect(assinaturaValida(CORPO, assinar(CORPO).replace(/[a-f]/g, (c) => c.toUpperCase()).replace("SHA256=", "sha256="), SEGREDO)).toBe(true);
  });

  it("recusa corpo alterado, segredo errado, cabeçalho ausente ou malformado", () => {
    expect(assinaturaValida(CORPO + " ", assinar(CORPO), SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, assinar(CORPO, "outro"), SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, null, SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, "", SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, "sha1=abc", SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, "sha256=zz", SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, assinar(CORPO).slice(0, -2), SEGREDO)).toBe(false);
  });

  it("recusa tudo quando o segredo não está configurado", () => {
    expect(assinaturaValida(CORPO, assinar(CORPO, ""), "")).toBe(false);
  });
});
