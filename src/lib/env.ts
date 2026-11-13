import "server-only";

/**
 * Variáveis de ambiente do servidor. NUNCA importar isto em componentes de
 * cliente — a service key do Supabase e a chave do modelo jamais podem ir pro navegador.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  // A Vercel guarda o valor literalmente: `"abc"` colado com aspas vira um
  // segredo com aspas dentro, e o erro só aparece longe daqui (assinatura que
  // não bate, URL inválida). Melhor parar na inicialização, com o nome.
  if (v.length >= 2 && /^(["'])[\s\S]*\1$/.test(v)) {
    throw new Error(
      `Variável de ambiente ${name} está entre aspas. Foi colada com aspas na Vercel? Tire as aspas do valor.`
    );
  }
  return v;
}

/** Inteiro positivo opcional. Valor presente mas inválido é erro, não default. */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Variável de ambiente ${name} precisa ser um inteiro positivo (veio "${raw}").`);
  }
  return n;
}

export const env = {
  // Supabase
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Segredo simples pra proteger endpoints internos (agendador do pg_cron)
  cronSecret: required("CRON_SECRET"),

  // Assinatura do JWT de sessão do painel. Trocar este valor derruba todo mundo.
  sessionSecret: required("SESSION_SECRET"),

  // Modelo do agente, na Featherless (API compatível com OpenAI). Sem valor
  // padrão de propósito: o modelo precisa suportar function calling e
  // streaming, e isso é escolha consciente, não acidente de default.
  featherlessApiKey: required("FEATHERLESS_API_KEY"),
  agenteModelo: required("AGENTE_MODELO"),

  // Teto de tokens por MEI por dia (controle de custo, README §9).
  limiteDiarioTokens: positiveInt("AGENTE_LIMITE_DIARIO_TOKENS", 400_000),
};
