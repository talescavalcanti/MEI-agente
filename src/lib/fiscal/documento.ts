// CPF e CNPJ em TypeScript, com o mesmo algoritmo do `documento_valido` do
// SQL (Task 17a): serve para validar o formulário antes de ir ao banco. Quem
// decide de verdade continua sendo o SQL.

/** Dígito verificador módulo 11 (CPF e CNPJ): resto < 2 vira 0. */
function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Devolve só os dígitos se for CPF (11) ou CNPJ (14) com os dígitos
 * verificadores certos e que não seja um dígito repetido; senão `null`.
 * Qualquer caractere que não é dígito é ignorado (pontos, traço, barra).
 */
export function documentoValido(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length !== 11 && d.length !== 14) return null;
  if (/^(\d)\1+$/.test(d)) return null;

  const [p1, p2] = d.length === 11 ? [PESOS_CPF_1, PESOS_CPF_2] : [PESOS_CNPJ_1, PESOS_CNPJ_2];
  const base = d.slice(0, -2);
  const d1 = digitoVerificador(base, p1);
  const d2 = digitoVerificador(base + d1, p2);
  return d.endsWith(`${d1}${d2}`) ? d : null;
}

/** `12345678909` → `123.456.789-09`; `12345678000195` → `12.345.678/0001-95`. Outro tamanho volta como veio. */
export function formatarDocumento(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return digitos;
}
