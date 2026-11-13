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

  // URL pública do app (ex.: https://mei-agente.vercel.app), sem barra no fim
  appUrl: required("APP_URL").replace(/\/$/, ""),

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

/**
 * `appUrl` só quando é um endereço que gente de fora consegue abrir: https e
 * fora de localhost. É o único que pode ir DENTRO de uma mensagem ou de uma
 * prévia de link (metadataBase).
 *
 * No meu-chat o APP_URL de produção já ficou `http://localhost:3000` (copiado
 * do .env.local) e os links saíram quebrados. Com este filtro, config errada
 * vira "sem link", nunca um link que não abre no celular de ninguém.
 */
export const publicAppUrl: string | null =
  /^https:\/\//i.test(env.appUrl) &&
  !/^https:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(env.appUrl)
    ? env.appUrl
    : null;
