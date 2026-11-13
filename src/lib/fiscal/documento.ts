// CPF e CNPJ em TypeScript, com o mesmo algoritmo do `documento_valido` do
// SQL (Task 17a): serve para validar o formulário antes de ir ao banco. Quem
// decide de verdade continua sendo o SQL.
//
// CNPJ alfanumérico (IN RFB 2.229/2024, inscrições novas desde julho de 2026;
// os CNPJs numéricos continuam valendo). Conferido em 13/11/2026 em:
//   - "Cálculo dos dígitos verificadores de CNPJ alfanumérico" (Serpro/Receita),
//     https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj
//   - Perguntas e respostas do CNPJ alfanumérico (Receita Federal),
//     https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf
// Formato: 12 posições [0-9A-Z] (raiz 8 + ordem 4) e 2 DV numéricos. Cada
// caractere vale o código ASCII menos 48 (dígito vale ele mesmo, A = 17 ...
// Z = 42), com os mesmos pesos e o mesmo módulo 11 do CNPJ numérico. Exemplo
// oficial: 12.ABC.345/01DE-35. A Receita só usa letras maiúsculas; aqui a
// minúscula é aceita e convertida.

/** Valor de um caractere no cálculo do DV: código ASCII − 48. */
function valor(c: string): number {
  return c.charCodeAt(0) - 48;
}

/** Dígito verificador módulo 11 (CPF e CNPJ): resto < 2 vira 0. */
function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += valor(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

const CPF = /^\d{11}$/;
/** CNPJ numérico ou alfanumérico: 12 posições [0-9A-Z] e 2 DV numéricos. */
const CNPJ = /^[0-9A-Z]{12}\d{2}$/;

/** Maiúsculas, sem ponto, barra, traço e espaço. Não valida. */
export function normalizarDocumento(doc: string | null | undefined): string {
  return (doc ?? "").toUpperCase().replace(/[./\-\s]/g, "");
}

/**
 * Devolve o documento normalizado (maiúsculas, sem pontuação) se for CPF (11
 * dígitos) ou CNPJ (14 posições, numérico ou alfanumérico) com os dígitos
 * verificadores certos; senão `null`. Sequência de um dígito repetido é
 * recusada (só existe nos numéricos). Qualquer caractere fora de [0-9A-Z],
 * depois de tirar ponto, barra, traço e espaço, invalida.
 */
export function documentoValido(doc: string | null | undefined): string | null {
  const d = normalizarDocumento(doc);
  const pesos = CPF.test(d) ? [PESOS_CPF_1, PESOS_CPF_2] : CNPJ.test(d) ? [PESOS_CNPJ_1, PESOS_CNPJ_2] : null;
  if (!pesos) return null;
  if (/^(\d)\1+$/.test(d)) return null;

  const base = d.slice(0, -2);
  const d1 = digitoVerificador(base, pesos[0]);
  const d2 = digitoVerificador(base + d1, pesos[1]);
  return d.endsWith(`${d1}${d2}`) ? d : null;
}

/**
 * `12345678909` → `123.456.789-09`; `12345678000195` → `12.345.678/0001-95`;
 * `12ABC34501DE35` → `12.ABC.345/01DE-35`. Fora desses formatos, volta como veio.
 */
export function formatarDocumento(documento: string): string {
  const d = normalizarDocumento(documento);
  if (CPF.test(d)) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (CNPJ.test(d)) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return documento;
}
