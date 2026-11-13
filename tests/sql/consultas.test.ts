import { afterEach, describe, expect, it } from "vitest";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

describe("consultas das telas", () => {
  let b: BancoTeste;
  afterEach(async () => { if (b) await b.fechar(); });

  it("lista todos os clientes do MEI sem o limite de busca e isola outro MEI", async () => {
    b = await abrirBancoTeste();
    const meiA = await criarMei(b);
    const meiB = await criarMei(b);
    for (let n = 1; n <= 12; n++) await b.rpc("cliente_salvar", { p_mei: meiA, p_dados: { nome: `Cliente ${n}` } });
    await b.rpc("cliente_salvar", { p_mei: meiB, p_dados: { nome: "Cliente externo" } });
    const clientes = await b.rpc("cliente_listar", { p_mei: meiA }) as { nome: string }[];
    expect(clientes).toHaveLength(12);
    expect(clientes.map(c => c.nome)).not.toContain("Cliente externo");
  });

  it("lista orçamentos e contratos com cliente e serviço, sem misturar MEIs", async () => {
    b = await abrirBancoTeste();
    const meiA = await criarMei(b);
    const meiB = await criarMei(b);
    const a = await b.rpc("cliente_salvar", { p_mei: meiA, p_dados: { nome: "Ana" } }) as { id: string };
    const z = await b.rpc("cliente_salvar", { p_mei: meiB, p_dados: { nome: "Zilda" } }) as { id: string };
    const sa = await b.rpc("servico_registrar", { p_mei: meiA, p_dados: { cliente_id: a.id, descricao: "Instalação", valor: 100 } }) as { id: string };
    const sb = await b.rpc("servico_registrar", { p_mei: meiB, p_dados: { cliente_id: z.id, descricao: "Reparo", valor: 200 } }) as { id: string };
    await b.rpc("orcamento_gerar", { p_mei: meiA, p_servico: sa.id });
    await b.rpc("orcamento_gerar", { p_mei: meiB, p_servico: sb.id });
    await b.rpc("contrato_salvar", { p_mei: meiA, p_servico: sa.id, p_minuta: "Minuta para Ana" });
    await b.rpc("contrato_salvar", { p_mei: meiB, p_servico: sb.id, p_minuta: "Minuta para Zilda" });
    const docs = await b.rpc("documentos_listar", { p_mei: meiA }) as { tipo: string; cliente_nome: string; descricao: string }[];
    expect(docs).toHaveLength(2);
    expect(docs.map(d => d.tipo).sort()).toEqual(["contrato", "orcamento"]);
    expect(docs.every(d => d.cliente_nome === "Ana" && d.descricao === "Instalação")).toBe(true);
  });

  it("lista mensagens e filtra status dentro do MEI", async () => {
    b = await abrirBancoTeste();
    const meiA = await criarMei(b);
    const meiB = await criarMei(b);
    const a = await b.rpc("cliente_salvar", { p_mei: meiA, p_dados: { nome: "Ana" } }) as { id: string };
    await b.rpc("mensagem_rascunhar", { p_mei: meiA, p_dados: { canal: "whatsapp", objetivo: "outro", conteudo: "Olá, Ana", cliente_id: a.id } });
    await b.rpc("mensagem_rascunhar", { p_mei: meiB, p_dados: { canal: "instagram", objetivo: "post", conteudo: "Post externo" } });
    const todas = await b.rpc("mensagens_listar", { p_mei: meiA }) as { conteudo: string; cliente_nome: string | null }[];
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ conteudo: "Olá, Ana", cliente_nome: "Ana" });
    expect(await b.rpc("mensagens_listar", { p_mei: meiA, p_status: "aprovado" })).toEqual([]);
    expect(await b.rpc("mensagens_listar", { p_mei: meiA, p_status: "rascunho" })).toHaveLength(1);
  });
});
