// Valores em reais citados num texto (mensagem, cláusula) que não batem com o
// valor do serviço. O cartão mostra o aviso antes de aprovar (Review Focus 5).
import { moeda } from "./formato";

// Número em reais: "1.200,50" (milhar com ponto), "800", "800,00", "800.5".
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

// Só conta como valor o que tem "R$" antes ou "reais" depois. Número solto
// ("dia 20", "apto 800", "12.000 BTUs") não é dinheiro.
const VALOR = new RegExp(
  String.raw`R\$\s*${NUM}(?![\d.,]?\d)(\s*mil\b)?` +
    "|" +
    String.raw`(?<![\d.,])${NUM}(\s*mil)?\s*reais\b`,
  "gi",
);

function paraNumero(s: string): number {
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}

/** Cada valor divergente uma vez, já formatado (`"R$ 80,00"`), na ordem do texto. */
export function valoresDivergentes(texto: string, valor: number): string[] {
  const alvo = Math.round(valor * 100);
  const vistos = new Set<number>();
  const saida: string[] = [];
  for (const m of texto.matchAll(VALOR)) {
    const num = m[1] ?? m[3];
    const mil = m[2] ?? m[4];
    const v = paraNumero(num) * (mil ? 1000 : 1);
    if (!Number.isFinite(v)) continue;
    const centavos = Math.round(v * 100);
    if (centavos === alvo || vistos.has(centavos)) continue;
    vistos.add(centavos);
    saida.push(moeda(centavos / 100));
  }
  return saida;
}
