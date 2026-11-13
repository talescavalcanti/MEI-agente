import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { proxy } from "@/proxy";

let token: string;

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "segredo-de-teste-do-proxy-com-32-chars";
  token = await signSession({ sub: "00000000-0000-0000-0000-000000000001", role: "admin", ver: 0 });
});

function pedir(caminho: string, logado = false): Promise<Response> {
  const req = new NextRequest(`http://localhost${caminho}`);
  if (logado) req.cookies.set(SESSION_COOKIE, token);
  return proxy(req);
}

/** `NextResponse.next()` não tem Location; redirecionamento tem. */
const destino = (res: Response) => res.headers.get("location");

describe("proxy: páginas legais", () => {
  it.each(["/privacidade", "/exclusao-de-dados"])("%s abre sem sessão", async (caminho) => {
    const res = await pedir(caminho);
    expect(destino(res)).toBeNull();
  });

  it.each(["/privacidade", "/exclusao-de-dados"])("%s abre para quem está logado", async (caminho) => {
    const res = await pedir(caminho, true);
    expect(destino(res)).toBeNull();
  });
});

describe("proxy: o resto continua igual", () => {
  it("painel sem sessão vai para o login guardando o destino", async () => {
    const res = await pedir("/painel");
    expect(destino(res)).toBe("http://localhost/login?de=%2Fpainel");
  });

  it("login com sessão vai para o painel", async () => {
    const res = await pedir("/login", true);
    expect(destino(res)).toBe("http://localhost/painel");
  });

  it("login sem sessão abre", async () => {
    expect(destino(await pedir("/login"))).toBeNull();
  });

  it("API passa sem sessão", async () => {
    expect(destino(await pedir("/api/health"))).toBeNull();
  });
});
