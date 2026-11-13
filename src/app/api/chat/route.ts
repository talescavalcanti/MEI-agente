import { after } from "next/server";
import { PRIVATE_HEADERS, requireUserApi } from "@/lib/auth/dal";
import { rodarTurno } from "@/lib/agente/loop";
import { prepararTurno, textoComContexto } from "@/lib/agente/servidor";
import type { Evento } from "@/lib/agente/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Um turno tem até 8 voltas do modelo (MAX_VOLTAS). */
export const maxDuration = 120;

/**
 * Chat com o agente. Corpo `{ conversaId: string | null, texto: string }`;
 * resposta `application/x-ndjson`, um `Evento` por linha, na ordem do turno
 * (texto em pedaços, ferramentas, cartões, erro, fim).
 *
 * 401 sem sessão, 400 corpo inválido (texto vazio ou com mais de 4000
 * caracteres), 409 usuário sem negócio cadastrado. Depois do 200, falha vira
 * evento `erro` dentro do stream: `rodarTurno` nunca lança.
 */

const TEXTO_MAX = 4000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pedido = { conversaId: string | null; texto: string };

function erro(status: number, mensagem: string): Response {
  return Response.json({ error: mensagem }, { status, headers: PRIVATE_HEADERS });
}

async function lerPedido(req: Request): Promise<{ ok: true; pedido: Pedido } | { ok: false; erro: string }> {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return { ok: false, erro: "Corpo da requisição inválido." };
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ok: false, erro: "Corpo da requisição inválido." };
  }
  const { conversaId, texto } = corpo as Record<string, unknown>;

  if (typeof texto !== "string" || !texto.trim()) return { ok: false, erro: "Escreva uma mensagem." };
  const limpo = texto.trim();
  if (limpo.length > TEXTO_MAX) {
    return { ok: false, erro: `A mensagem passou de ${TEXTO_MAX} caracteres. Divida em partes menores.` };
  }

  if (conversaId !== null && conversaId !== undefined && (typeof conversaId !== "string" || !UUID.test(conversaId))) {
    return { ok: false, erro: "Conversa inválida." };
  }

  return { ok: true, pedido: { conversaId: (conversaId as string | null | undefined) ?? null, texto: limpo } };
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const lido = await lerPedido(req);
  if (!lido.ok) return erro(400, lido.erro);
  const { pedido } = lido;

  let preparo: Awaited<ReturnType<typeof prepararTurno>>;
  let texto: string;
  try {
    preparo = await prepararTurno(auth.user.id);
    if (!preparo) return erro(409, "Cadastre o seu negócio antes de falar com o agente.");
    texto = await textoComContexto(preparo.deps, preparo.mei, pedido.texto);
  } catch (e) {
    console.error("[chat] preparar turno:", e);
    return erro(500, "Não deu para começar agora. Tente de novo em instantes.");
  }
  const { deps } = preparo;

  const encoder = new TextEncoder();
  let aberto = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emitir = (e: Evento) => {
        if (!aberto) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      // O turno não espera o leitor: se a pessoa fechar a aba, ele segue até
      // gravar tudo (o laço ignora falha de quem ouve).
      const turno = rodarTurno(deps, { conversaId: pedido.conversaId, texto, origem: "chat" }, emitir)
        .catch((e) => console.error("[chat] turno:", e))
        .finally(() => {
          if (!aberto) return;
          aberto = false;
          try {
            controller.close();
          } catch {
            // Já fechado pelo leitor.
          }
        });
      manterVivo(turno);
    },
    cancel() {
      aberto = false;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Proxy na frente (nginx e afins) não segura os pedaços.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Pede à plataforma para não congelar a função antes do turno terminar,
 * mesmo que o cliente desconecte. Fora de uma requisição do Next (testes),
 * `after` lança: aí não há o que manter.
 */
function manterVivo(p: Promise<unknown>) {
  try {
    after(p);
  } catch {
    // Sem contexto de requisição.
  }
}
