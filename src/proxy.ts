import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Proxy — o que até o Next 15 se chamava `middleware.ts`. Mesmo comportamento,
 * nome novo a partir do Next 16, e agora rodando no runtime Node.
 *
 * ISTO NÃO É A CAMADA DE AUTORIZAÇÃO. É checagem otimista: lê o cookie, confere
 * a assinatura e redireciona cedo, para ninguém ver o esqueleto de uma tela que
 * não pode abrir. Nada de banco aqui — o proxy roda em toda navegação, prefetch
 * incluído, e uma consulta por prefetch acabaria com o tempo de resposta.
 *
 * Quem decide de verdade é o DAL (`src/lib/auth/dal.ts`), colado no dado: é lá
 * que se sabe se o usuário ainda existe, se o papel dele mudou e se a senha foi
 * trocada. O proxy não enxerga Server Action nem Route Handler, então tratá-lo
 * como a tranca deixaria as duas portas mais importantes abertas.
 */

/** Rotas que existem justamente para quem não tem sessão. */
const PUBLIC_PAGES = new Set(["/login", "/setup", "/cadastro"]);

/**
 * Rotas abertas para todo mundo, com ou sem sessão: as páginas legais que a
 * Meta exige e a landing page.
 */
const OPEN_PAGES = new Set(["/privacidade", "/exclusao-de-dados", "/lp"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /* As rotas de API se defendem sozinhas, cada uma com a regra que lhe cabe:
     o chat responde 401 sem sessão (requireUserApi), o health check é público
     e os crons do pg_cron não têm nem podem ter sessão (autenticados por
     CRON_SECRET). Redirecionar essas para /login quebraria a operação. */
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (OPEN_PAGES.has(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (PUBLIC_PAGES.has(pathname)) {
    // Já logado não tem o que fazer no login. (Em /setup a própria página
    // ainda confere se a tabela está vazia — aqui é só conveniência.)
    if (session) return NextResponse.redirect(new URL("/painel", req.nextUrl));
    return NextResponse.next();
  }

  if (!session) {
    const url = new URL("/login", req.nextUrl);
    // Guarda para onde a pessoa queria ir, e devolve depois do login.
    if (pathname !== "/") url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Fora: assets do Next, favicon e arquivos estáticos. Tudo o mais passa aqui.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
