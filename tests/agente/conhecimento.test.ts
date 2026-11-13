import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executarFerramenta } from "@/lib/agente/ferramentas/executar";
import { rodarTurno } from "@/lib/agente/loop";
import type { Evento } from "@/lib/agente/tipos";
import type { Cliente } from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";
import { llmFalso } from "../helpers/llm-falso";

let b: BancoTeste;
let mei: string;
let ana: Cliente;

const HOJE = "2026-11-13";

beforeEach(async () => {
  b = await abrirBancoTeste();
  mei = await criarMei(b, "Lima Reparos");
  ana = (await b.rpc("cliente_salvar", { p_mei: mei, p_dados: { nome: "Ana Ribeiro", whatsapp: "62 90000-0001" } })) as Cliente;
  const salvar = (dados: Record<string, unknown>) => b.rpc("conhecimento_salvar", { p_mei: mei, p_dados: dados });
  await salvar({ tipo: "politica", titulo: "Garantia", conteudo: "Garantia de 90 dias na mão de obra." });
  await salvar({ tipo: "preco", titulo: "Limpeza de split", conteudo: "R$ 160,00 por aparelho." });
  await salvar({ tipo: "nota_cliente", cliente_id: ana.id, titulo: "Acesso", conteudo: "Apartamento 802, prefere de manhã." });
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const rodar = (entrada: unknown, meiId = mei) =>
  executarFerramenta({ rpc: b.rpc, meiId, hoje: HOJE }, "consultar_conhecimento", entrada);

describe("consultar_conhecimento", () => {
  it("devolve os itens achados, sem campos internos", async () => {
    const r = await rodar({ termo: "garantia do serviço" });
    expect(r.erro).toBe(false);
    expect(r.cartao).toBeUndefined();
    const dados = JSON.parse(r.conteudo);
    expect(dados.resultados).toHaveLength(1);
    expect(dados.resultados[0]).toEqual({
      id: expect.any(String),
      tipo: "politica",
      titulo: "Garantia",
      conteudo: "Garantia de 90 dias na mão de obra.",
      cliente_id: null,
      cliente_nome: null,
    });
  });

  it("filtra por cliente e por tipo", async () => {
    const porCliente = JSON.parse((await rodar({ termo: "acesso manhã", cliente_id: ana.id })).conteudo);
    expect(porCliente.resultados.map((x: { titulo: string }) => x.titulo)).toEqual(["Acesso"]);
    const porTipo = JSON.parse((await rodar({ termo: "split garantia", tipo: "preco" })).conteudo);
    expect(porTipo.resultados.map((x: { titulo: string }) => x.titulo)).toEqual(["Limpeza de split"]);
  });

  it("nada encontrado é lista vazia com frase clara, sem erro", async () => {
    const r = await rodar({ termo: "piscina" });
    expect(r.erro).toBe(false);
    const dados = JSON.parse(r.conteudo);
    expect(dados.resultados).toEqual([]);
    expect(dados.mensagem).toMatch(/nada encontrado/i);
  });

  it("outro MEI não vê o conhecimento deste", async () => {
    const outro = await criarMei(b, "Outro");
    const dados = JSON.parse((await rodar({ termo: "garantia" }, outro)).conteudo);
    expect(dados.resultados).toEqual([]);
  });

  it("entrada inválida não chega ao banco", async () => {
    for (const entrada of [{}, { termo: "" }, { termo: "x", cliente_id: "ana" }, { termo: "x", tipo: "receita" }]) {
      const r = await rodar(entrada);
      expect(r.erro, JSON.stringify(entrada)).toBe(true);
      expect(JSON.parse(r.conteudo).entrada_invalida).toBeDefined();
    }
  });
});

describe("laço com consultar_conhecimento", () => {
  it("o modelo consulta e recebe o resultado na volta seguinte", async () => {
    const llm = llmFalso([
      { chamadas: [{ nome: "consultar_conhecimento", entrada: { termo: "garantia" } }] },
      { texto: "A garantia é de 90 dias na mão de obra." },
    ]);
    const eventos: Evento[] = [];
    await rodarTurno(
      { rpc: b.rpc, llm, meiId: mei, hoje: HOJE, system: "s", limiteDiario: 1e9 },
      { conversaId: null, texto: "Qual a garantia que eu dou?" },
      (e) => eventos.push(e),
    );

    expect(llm.pedidos).toHaveLength(2);
    expect(llm.pedidos[0].ferramentas.map((f) => f.nome)).toContain("consultar_conhecimento");
    const resultado = JSON.stringify(llm.pedidos[1].mensagens.at(-1));
    expect(resultado).toContain("90 dias na mão de obra");
    expect(eventos).toContainEqual({ tipo: "ferramenta", nome: "consultar_conhecimento", erro: false });
    expect(eventos.some((e) => e.tipo === "erro")).toBe(false);
  });
});
