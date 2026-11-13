import { beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/session";

beforeAll(() => {
  // Segredo só de teste: `secret()` lê a variável na hora de assinar.
  process.env.SESSION_SECRET = "segredo-de-teste-com-tamanho-suficiente-0123456789";
});

describe("sessão", () => {
  it("usa o cookie do MEIagente", () => {
    expect(SESSION_COOKIE).toBe("mei_session");
  });

  it("verifySession devolve o mesmo sub que signSession assinou", async () => {
    const token = await signSession({ sub: "usuario-123", role: "user", ver: 1 });
    const payload = await verifySession(token);
    expect(payload).toEqual({ sub: "usuario-123", role: "user", ver: 1 });
  });

  it("token adulterado devolve null", async () => {
    const token = await signSession({ sub: "usuario-123", role: "user", ver: 1 });
    const [header, body, assinatura] = token.split(".");

    // Troca o payload por outro (sub e papel diferentes) mantendo a assinatura.
    const forjado = Buffer.from(
      JSON.stringify({ sub: "outro-usuario", role: "admin", ver: 1 }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${forjado}.${assinatura}`)).toBeNull();

    // Assinatura corrompida.
    const ultima = assinatura.at(-1) === "A" ? "B" : "A";
    expect(await verifySession(`${header}.${body}.${assinatura.slice(0, -1)}${ultima}`)).toBeNull();

    // Lixo e ausência.
    expect(await verifySession("nao-e-um-jwt")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("token assinado com outro segredo devolve null", async () => {
    const token = await signSession({ sub: "usuario-123", role: "admin", ver: 2 });
    process.env.SESSION_SECRET = "outro-segredo-de-teste-com-tamanho-suficiente-9876";
    try {
      expect(await verifySession(token)).toBeNull();
    } finally {
      process.env.SESSION_SECRET = "segredo-de-teste-com-tamanho-suficiente-0123456789";
    }
  });
});
