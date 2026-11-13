// Smoke do agente contra o modelo de verdade (Task 10, Step 5): roda as duas
// falas do README §3 num banco PGlite em memória e confere o resultado. É também
// o teste de aceitação do AGENTE_MODELO: se não fechar o cenário, trocar o modelo.
//
// GASTA CRÉDITO NA FEATHERLESS. Só rodar com o ok do dono. Sem `--confirmo`,
// só mostra o que faria e sai sem chamar nada.
//
// Uso (na raiz do repo, com FEATHERLESS_API_KEY e AGENTE_MODELO no .env.local
// ou no ambiente):
//
//   JITI_ALIAS='{"@":"./src","server-only":"./tests/helpers/vazio.ts"}' \
//     npx jiti scripts/agente-smoke.ts --confirmo [--sem-streaming]
//
// Saída: texto do agente, ferramentas chamadas, cartões e tokens. Código de
// saída 0 se passou (3 cartões, serviço confirmado, nenhuma entrada_invalida).
import { existsSync } from "node:fs";

const FALAS = [
  "Fechei uma instalação de ar-condicionado por R$ 800 para sexta.",
  "Maria Souza, 62 98888-7777, Rua 10, Setor Bueno. Pix na entrega.",
];

const args = new Set(process.argv.slice(2));
const confirmado = args.has("--confirmo");
const streaming = !args.has("--sem-streaming");

async function main(): Promise<number> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const chave = process.env.FEATHERLESS_API_KEY;
  const modelo = process.env.AGENTE_MODELO;
  if (!chave || !modelo) {
    console.error("Faltam FEATHERLESS_API_KEY e/ou AGENTE_MODELO (no .env.local ou no ambiente).");
    return 1;
  }

  console.log(`Modelo: ${modelo} · streaming: ${streaming ? "sim" : "não"}`);
  console.log(`Falas (${FALAS.length} turnos, até 8 voltas cada):`);
  for (const f of FALAS) console.log(`  > ${f}`);
  if (!confirmado) {
    console.log("\nNada foi chamado. Isto gasta crédito: rode de novo com --confirmo para valer.");
    return 0;
  }

  // O smoke não usa o Supabase, mas o env.ts exige as variáveis na carga.
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "SESSION_SECRET"]) {
    process.env[k] ||= "smoke-sem-uso";
  }

  // Import dinâmico: o env.ts valida as variáveis na carga, então só depois.
  const { abrirBancoTeste, criarMei } = await import("../tests/helpers/banco");
  const { criarLlm } = await import("@/lib/agente/llm");
  const { rodarTurno } = await import("@/lib/agente/loop");
  const { montarSystem } = await import("@/lib/agente/prompt");
  const { blocoContexto } = await import("@/lib/agente/contexto");
  const { ymdSP } = await import("@/lib/tz");
  type Mei = import("@/lib/dominio/tipos").Mei;
  type Cartao = import("@/lib/agente/ferramentas/executar").Cartao;

  const b = await abrirBancoTeste();
  try {
    const meiId = await criarMei(b, "Refrigeração do Zé");
    const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [meiId]);
    const mei = (await b.rpc("mei_salvar", {
      p_user: user_id,
      p_dados: { atividade: "Instalação e manutenção de ar-condicionado", cidade: "Goiânia", chave_pix: "62999990000" },
    })) as Mei;

    const llm = criarLlm({ streaming });
    const hoje = ymdSP(new Date());
    const deps = { rpc: b.rpc, llm, meiId, hoje, system: montarSystem(), limiteDiario: 1_000_000 };

    const cartoes: Cartao[] = [];
    const erros: string[] = [];
    let conversaId: string | null = null;

    for (const fala of FALAS) {
      const memorias = ((await b.rpc("memoria_listar", { p_mei: meiId })) as { fato: string }[]).map((m) => m.fato);
      const texto = `${blocoContexto(mei, memorias, hoje)}\n\n${fala}`;
      console.log(`\n=== MEI: ${fala}\n--- Agente:`);
      const r = await rodarTurno(deps, { conversaId, texto }, (e) => {
        if (e.tipo === "texto") process.stdout.write(e.delta);
        else if (e.tipo === "ferramenta") console.log(`\n  [ferramenta] ${e.nome}${e.erro ? " (erro)" : ""}`);
        else if (e.tipo === "cartao") {
          cartoes.push(e.cartao);
          console.log(`\n  [cartão] ${e.cartao.tipo} ${e.cartao.id}`);
        } else if (e.tipo === "erro") {
          erros.push(e.mensagem);
          console.log(`\n  [erro] ${e.mensagem}`);
        }
      });
      conversaId = r.conversaId || conversaId;
      console.log();
    }

    // Conferência no banco.
    const acoes = await b.q(
      `select nome, erro, saida::text as saida from public.agente_acoes where mei_id = $1 and tipo = 'ferramenta' order by criado_em`,
      [meiId],
    );
    const invalidas = acoes.filter((a) => String(a.saida).includes("entrada_invalida"));
    const servicos = await b.q(`select numero, descricao, valor, status from public.servicos where mei_id = $1`, [meiId]);
    const [usoDia] = await b.q(
      `select coalesce(sum(tokens_entrada), 0)::int as entrada, coalesce(sum(tokens_saida), 0)::int as saida from public.agente_uso where mei_id = $1`,
      [meiId],
    );

    console.log("\n=== Resumo");
    console.log(`Ferramentas (${acoes.length}): ${acoes.map((a) => `${a.nome}${a.erro ? "!" : ""}`).join(", ")}`);
    for (const a of invalidas) console.log(`  entrada_invalida em ${a.nome}: ${a.saida}`);
    console.log(`Cartões (${cartoes.length}): ${cartoes.map((c) => c.tipo).join(", ")}`);
    console.log(`Serviços: ${servicos.map((s) => `#${s.numero} ${s.descricao} R$ ${s.valor} ${s.status}`).join("; ") || "nenhum"}`);
    console.log(`Tokens: entrada ${usoDia.entrada}, saída ${usoDia.saida}`);
    if (erros.length) console.log(`Erros: ${erros.join(" | ")}`);

    const tipos = new Set(cartoes.map((c) => c.tipo));
    const checagens: [string, boolean][] = [
      ["3 cartões (orçamento, contrato e mensagem)", ["orcamento", "contrato", "mensagem"].every((t) => tipos.has(t as Cartao["tipo"]))],
      ["serviço confirmado", servicos.some((s) => s.status === "confirmado")],
      ["nenhuma entrada_invalida", invalidas.length === 0],
      ["nenhum erro no turno", erros.length === 0],
    ];
    for (const [nome, ok] of checagens) console.log(`${ok ? "OK  " : "FALHOU"} ${nome}`);
    return checagens.every(([, ok]) => ok) ? 0 : 1;
  } finally {
    await b.fechar();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
