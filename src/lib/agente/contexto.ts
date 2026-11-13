// Bloco de contexto do negócio, prefixado ao texto do usuário a cada turno.
// Fica fora do prompt do sistema para o system continuar constante.

import type { Mei } from "@/lib/dominio/tipos";

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Dia da semana de uma data `AAAA-MM-DD` (a data já vem no fuso de São Paulo). */
function diaDaSemana(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : DIAS[d.getUTCDay()];
}

/** Uma linha só e sem tags: texto vindo do usuário não fecha o bloco. */
function limpar(texto: string): string {
  return texto.replace(/<\/?contexto_do_negocio>/gi, "").replace(/\s+/g, " ").trim();
}

/**
 * Contexto do turno: dados do MEI, `hoje` (`AAAA-MM-DD`, calculado em
 * America/Sao_Paulo por quem chama) e as memórias do negócio.
 */
export function blocoContexto(mei: Mei, memorias: string[], hoje: string): string {
  const dia = diaDaSemana(hoje);
  const linhas = [
    `Hoje: ${hoje}${dia ? ` (${dia})` : ""}`,
    `Negócio: ${limpar(mei.nome)}`,
  ];
  if (mei.atividade) linhas.push(`Atividade: ${limpar(mei.atividade)}`);
  if (mei.cidade) linhas.push(`Cidade: ${limpar(mei.cidade)}`);
  if (mei.chave_pix) linhas.push(`Chave Pix: ${limpar(mei.chave_pix)}`);

  const fatos = memorias.map(limpar).filter(Boolean);
  if (fatos.length) {
    linhas.push("Fatos guardados:", ...fatos.map((f) => `- ${f}`));
  }

  return `<contexto_do_negocio>\n${linhas.join("\n")}\n</contexto_do_negocio>`;
}
