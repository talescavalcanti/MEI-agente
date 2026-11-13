import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cliente, Conhecimento, ConhecimentoAchado } from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;
let mei: string;

beforeEach(async () => {
  b = await abrirBancoTeste();
  mei = await criarMei(b, "Lima Reparos");
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const salvar = (dados: Record<string, unknown>, p_mei = mei) =>
  b.rpc("conhecimento_salvar", { p_mei, p_dados: dados }) as Promise<Conhecimento>;

const buscar = (args: Record<string, unknown>, p_mei = mei) =>
  b.rpc("conhecimento_buscar", { p_mei, ...args }) as Promise<ConhecimentoAchado[]>;

async function cliente(nome: string, whatsapp: string, p_mei = mei): Promise<Cliente> {
  return (await b.rpc("cliente_salvar", { p_mei, p_dados: { nome, whatsapp } })) as Cliente;
}

async function erro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("era para dar erro");
}

describe("conhecimento_salvar", () => {
  it("grava com o texto limpo e devolve a linha", async () => {
    const k = await salvar({ tipo: "preco", titulo: "  Instalação   de split ", conteudo: "R$ 450 até 12.000 BTUs." });
    expect(k).toMatchObject({ mei_id: mei, tipo: "preco", titulo: "Instalação de split", cliente_id: null });
    expect(k.conteudo).toBe("R$ 450 até 12.000 BTUs.");
  });

  it("mesmo tipo, cliente e título (sem diferença de caixa) atualiza em vez de duplicar", async () => {
    const a = await salvar({ tipo: "faq", titulo: "Garantia", conteudo: "90 dias." });
    const c = await salvar({ tipo: "FAQ", titulo: "garantia", conteudo: "90 dias na mão de obra." });
    expect(c.id).toBe(a.id);
    expect(c.conteudo).toBe("90 dias na mão de obra.");
    expect((await b.q("select count(*)::int as n from public.conhecimento"))[0].n).toBe(1);
  });

  it("nota de cliente exige cliente do mesmo MEI", async () => {
    expect(await erro(salvar({ tipo: "nota_cliente", titulo: "Portão", conteudo: "Tem cachorro." }))).toBe(
      "regra: informe o cliente desta nota",
    );
    const outroMei = await criarMei(b, "Outro");
    const deFora = await cliente("Rita", "62 90000-0099", outroMei);
    expect(
      await erro(salvar({ tipo: "nota_cliente", cliente_id: deFora.id, titulo: "Portão", conteudo: "Tem cachorro." })),
    ).toBe("regra: cliente não encontrado");
    expect(
      await erro(salvar({ tipo: "atendimento", cliente_id: "nao-e-uuid", titulo: "Visita", conteudo: "Ok." })),
    ).toBe("regra: cliente não encontrado");
  });

  it("recusa tipo inválido e texto vazio ou longo demais", async () => {
    expect(await erro(salvar({ tipo: "receita", titulo: "x", conteudo: "y" }))).toMatch(
      /^regra: tipo de conhecimento inválido/,
    );
    expect(await erro(salvar({ tipo: "faq", titulo: "  ", conteudo: "y" }))).toBe("regra: informe o título");
    expect(await erro(salvar({ tipo: "faq", titulo: "x", conteudo: "" }))).toBe("regra: informe o conteúdo");
    expect(await erro(salvar({ tipo: "faq", titulo: "x".repeat(201), conteudo: "y" }))).toBe(
      "regra: o título passou de 200 caracteres",
    );
    expect(await erro(salvar({ tipo: "faq", titulo: "x", conteudo: "y".repeat(4001) }))).toBe(
      "regra: o conteúdo passou de 4000 caracteres",
    );
  });

  it("MEI inexistente vira regra", async () => {
    expect(
      await erro(salvar({ tipo: "faq", titulo: "x", conteudo: "y" }, "00000000-0000-0000-0000-000000000000")),
    ).toBe("regra: negócio não encontrado");
  });
});

describe("conhecimento_buscar", () => {
  beforeEach(async () => {
    await salvar({ tipo: "preco", titulo: "Instalação de ar-condicionado split", conteudo: "R$ 450 para até 12.000 BTUs, com suporte." });
    await salvar({ tipo: "politica", titulo: "Garantia", conteudo: "Garantia de 90 dias na mão de obra." });
    await salvar({ tipo: "faq", titulo: "Atende aos domingos?", conteudo: "Não. Só de segunda a sábado." });
  });

  it("acha sem acento e com outra flexão da palavra", async () => {
    const [r] = await buscar({ p_termo: "instalacao do ar condicionado" });
    expect(r).toMatchObject({ tipo: "preco", titulo: "Instalação de ar-condicionado split" });
    expect(r.relevancia).toBeGreaterThan(0);
    expect((await buscar({ p_termo: "garantias" }))[0].titulo).toBe("Garantia");
  });

  it("combina os termos com OU e põe primeiro quem casa mais", async () => {
    const r = await buscar({ p_termo: "garantia domingo" });
    expect(r.map((x) => x.titulo).sort()).toEqual(["Atende aos domingos?", "Garantia"]);
    const [primeiro] = await buscar({ p_termo: "garantia mão de obra domingo" });
    expect(primeiro.titulo).toBe("Garantia");
  });

  it("nada encontrado devolve lista vazia, e termo só de palavras vazias também", async () => {
    expect(await buscar({ p_termo: "orçamento de piscina" })).toEqual([]);
    expect(await buscar({ p_termo: "de a o" })).toEqual([]);
  });

  it("termo em branco é regra", async () => {
    expect(await erro(buscar({ p_termo: "   " }))).toBe("regra: informe o que buscar");
  });

  it("outro MEI não vê", async () => {
    const outro = await criarMei(b, "Outro");
    expect(await buscar({ p_termo: "garantia" }, outro)).toEqual([]);
  });

  it("filtra por cliente e por tipo, e acha pelo nome do cliente", async () => {
    const ana = await cliente("Ana Ribeiro", "62 90000-0001");
    const beto = await cliente("Beto Souza", "62 90000-0002");
    await salvar({ tipo: "nota_cliente", cliente_id: ana.id, titulo: "Acesso", conteudo: "Portão eletrônico, tem cachorro." });
    await salvar({ tipo: "atendimento", cliente_id: beto.id, titulo: "Visita de 10/10", conteudo: "Limpeza do split, portão emperrado." });

    const porNome = await buscar({ p_termo: "ana" });
    expect(porNome).toHaveLength(1);
    expect(porNome[0]).toMatchObject({ cliente_id: ana.id, cliente_nome: "Ana Ribeiro", tipo: "nota_cliente" });

    expect((await buscar({ p_termo: "portão", p_cliente: beto.id })).map((x) => x.titulo)).toEqual(["Visita de 10/10"]);
    expect((await buscar({ p_termo: "portão", p_tipo: "nota_cliente" })).map((x) => x.titulo)).toEqual(["Acesso"]);
    expect(await erro(buscar({ p_termo: "portão", p_tipo: "receita" }))).toMatch(/^regra: tipo de conhecimento inválido/);
  });

  it("respeita o limite (1 a 10) e corta conteúdo longo", async () => {
    for (let i = 1; i <= 12; i++) {
      await salvar({ tipo: "faq", titulo: `Pergunta sobre fiação ${i}`, conteudo: `Fiação ${"x ".repeat(400)}` });
    }
    expect(await buscar({ p_termo: "fiação" })).toHaveLength(5);
    expect(await buscar({ p_termo: "fiação", p_limite: 50 })).toHaveLength(10);
    expect(await buscar({ p_termo: "fiação", p_limite: 0 })).toHaveLength(1);
    const [r] = await buscar({ p_termo: "fiação" });
    expect(r.conteudo.length).toBeLessThanOrEqual(601);
    expect(r.conteudo.endsWith("…")).toBe(true);
  });

  it("reindexa ao atualizar o conteúdo", async () => {
    await salvar({ tipo: "politica", titulo: "Garantia", conteudo: "Cobre peças trocadas por seis meses." });
    expect((await buscar({ p_termo: "peças" }))[0].titulo).toBe("Garantia");
    expect(await buscar({ p_termo: "90 dias obra" })).toEqual([]);
  });
});
