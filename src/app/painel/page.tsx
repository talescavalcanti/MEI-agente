import type { Metadata } from "next";
import { requireMei } from "@/lib/dominio/mei";
import { APP_TZ } from "@/lib/tz";
import EmptyModule from "./EmptyModule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mesmo segmento do painel/layout.tsx: o template de título dele não vale
// aqui (só para as abas filhas), então o título vai completo.
export const metadata: Metadata = { title: "Início · MEIagente" };

/**
 * Início PROVISÓRIO (Task 1): só prova que login, sessão e casca funcionam.
 * O Início de verdade (pendências e próximas ações) chega com a proatividade.
 */
export default async function Inicio() {
  const { user: me } = await requireMei();

  return (
    <EmptyModule
      section="Início"
      title={`${greeting(requestNow())}, ${firstName(me.name)}.`}
      summary="Aqui vão aparecer as pendências do dia e o que o agente sugere fazer em seguida."
      phase="Em breve"
      phaseNote="Enquanto isso, o resto do painel vai sendo montado aba por aba."
      items={[
        "Propostas paradas há dias, com a mensagem de lembrete já redigida",
        "Serviços da semana, com o que ainda falta para fechar cada um",
        "Rascunhos de orçamento, minuta e mensagem esperando a sua aprovação",
      ]}
    />
  );
}

/**
 * Relógio do servidor para quem renderiza. Fica numa função à parte porque
 * componente tem que ser puro (react-hooks/purity): a página é dinâmica, então
 * "agora" é o instante da requisição, uma vez só.
 */
function requestNow(): number {
  return Date.now();
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora de São Paulo (o servidor roda em UTC). */
function greeting(now: number): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}

/** Primeiro nome do usuário do painel, para a saudação. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
