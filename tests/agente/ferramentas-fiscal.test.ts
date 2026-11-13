import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FERRAMENTAS } from "@/lib/agente/ferramentas/definicoes";
import { executarFerramenta } from "@/lib/agente/ferramentas/executar";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;
let mei: string;

beforeEach(async () => {
  b = await abrirBancoTeste();
  mei = await criarMei(b, "Refrigeração Bueno");
  await b.rpc("mei_dados_fiscais_salvar", {
    p_mei: mei,
    p_dados: { cnpj: "11.222.333/0001-81", municipio: "Goiânia", codigo_tributacao: "14.01.01" },
  });
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const HOJE = "2026-11-13";
// Dígitos verificadores corretos (os mesmos dos testes do SQL fiscal).
const CNPJ_CLIENTE = "11.444.777/0001-61";

const rodar = (nome: string, entrada: unknown) => executarFerramenta({ rpc: b.rpc, meiId: mei, hoje: HOJE }, nome, entrada);

async function ok(nome: string, entrada: unknown) {
  const r = await rodar(nome, entrada);
  expect(r.erro, `${nome}: ${r.conteudo}`).toBe(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { r, dados: JSON.parse(r.conteudo) as any };
}

async function falha(nome: string, entrada: unknown) {
  const r = await rodar(nome, entrada);
  expect(r.erro, `${nome}: ${r.conteudo}`).toBe(true);
  return JSON.parse(r.conteudo) as { erro?: string; entrada_invalida?: string[] };
}

/** Cliente PJ com CNPJ, serviço fechado de R$ 800 e pagamento de R$ 800, só por ferramentas. */
async function servicoPagoDePj() {
  const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Empresa X", whatsapp: "62999990000" });
  const { dados: doc } = await ok("salvar_documento_cliente", { cliente_id: c.id, documento: CNPJ_CLIENTE });
  expect(doc.documento).toBe("11.444.777/0001-61");
  const { dados: s } = await ok("registrar_servico", {
    cliente_id: c.id,
    descricao: "Manutenção de ar-condicionado",
    valor: 800,
    fechado: true,
  });
  await ok("registrar_pagamento", { servico_id: s.id, valor: 800, forma: "pix" });
  return { cliente: c, servico: s };
}

describe("ferramentas fiscais: definições", () => {
  it("as três ferramentas novas existem, com descrição curta", () => {
    for (const nome of ["preparar_nota_fiscal", "salvar_documento_cliente", "consultar_faturamento"]) {
      const f = FERRAMENTAS.find((x) => x.nome === nome);
      expect(f, nome).toBeDefined();
      expect(f!.descricao.length, nome).toBeLessThanOrEqual(200);
    }
  });

  it("nenhuma ferramenta começa com emitir ou enviar", () => {
    expect(FERRAMENTAS.filter((f) => /^(emitir|enviar)/.test(f.nome))).toEqual([]);
  });
});

describe("ferramentas fiscais: execução", () => {
  it("ponta a ponta: preparar_nota_fiscal devolve cartão nota; repetir devolve a mesma", async () => {
    const { servico } = await servicoPagoDePj();

    const a = await ok("preparar_nota_fiscal", { servico_id: servico.id });
    expect(a.r.cartao).toEqual({ tipo: "nota", id: a.dados.id });
    expect(a.dados.status).toBe("rascunho");
    expect(Array.isArray(a.dados.avisos)).toBe(true);
    // O modelo não recebe valor, documento nem códigos para reescrever.
    for (const campo of ["valor", "tomador_documento", "codigo_tributacao", "nbs", "descricao", "competencia"]) {
      expect(a.dados, campo).not.toHaveProperty(campo);
    }
    expect(a.r.conteudo).not.toContain("800");
    expect(a.r.conteudo).not.toContain("11444777000161");

    const de_novo = await ok("preparar_nota_fiscal", { servico_id: servico.id });
    expect(de_novo.r.cartao?.id).toBe(a.dados.id);
    expect(await b.q(`select count(*)::int as n from public.notas_fiscais`)).toEqual([{ n: 1 }]);
  });

  it("avisos vêm com código e texto para o modelo citar", async () => {
    const { servico } = await servicoPagoDePj();
    await b.q(`update public.pagamentos set valor = 700 where servico_id = $1`, [servico.id]);
    const { dados } = await ok("preparar_nota_fiscal", { servico_id: servico.id });
    expect(dados.avisos).toContainEqual(
      expect.objectContaining({ codigo: "pagamento_diferente", texto: expect.any(String) }),
    );
  });

  it("preparar_nota_fiscal com servico_id aleatório → erro legível de não encontrado", async () => {
    const r = await falha("preparar_nota_fiscal", { servico_id: randomUUID() });
    expect(r.erro).toMatch(/não encontrad/);
  });

  it("preparar_nota_fiscal antes do serviço executado → erro da regra", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Empresa Y" });
    await ok("salvar_documento_cliente", { cliente_id: c.id, documento: CNPJ_CLIENTE });
    const { dados: s } = await ok("registrar_servico", { cliente_id: c.id, descricao: "Limpeza", valor: 300, fechado: true });
    const r = await falha("preparar_nota_fiscal", { servico_id: s.id });
    expect(r.erro).toBe("a nota só pode ser preparada depois do serviço executado");
  });

  it("salvar_documento_cliente com dígito errado → erro e nada gravado", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Empresa Z" });
    const r = await falha("salvar_documento_cliente", { cliente_id: c.id, documento: "11.444.777/0001-62" });
    expect(r.erro).toBe("CPF ou CNPJ inválido");
    expect(await b.q(`select documento from public.clientes where id = $1`, [c.id])).toEqual([{ documento: null }]);
  });

  it("salvar_documento_cliente devolve CPF formatado", async () => {
    const { dados: c } = await ok("criar_ou_atualizar_cliente", { nome: "Maria" });
    const { dados } = await ok("salvar_documento_cliente", { cliente_id: c.id, documento: "52998224725" });
    expect(dados).toMatchObject({ id: c.id, documento: "529.982.247-25" });
  });

  it("consultar_faturamento devolve o faturamento do ano", async () => {
    await servicoPagoDePj();
    const { dados } = await ok("consultar_faturamento", {});
    expect(dados).toMatchObject({ total: 800, com_nota: 0, sem_nota: 800, faixa: "ok" });
  });

  it("redigir_mensagem envio_nota citando R$ 80 numa nota de 800 → aviso_valores (Review Focus 5)", async () => {
    const { cliente, servico } = await servicoPagoDePj();
    const { dados: nota } = await ok("preparar_nota_fiscal", { servico_id: servico.id });
    const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [mei]);
    await b.rpc("nota_decidir", { p_mei: mei, p_id: nota.id, p_decisao: "aprovar", p_user: user_id, p_avisos_confirmados: true });
    await b.rpc("nota_registrar_emissao", { p_mei: mei, p_id: nota.id, p_dados: { numero_nfse: "42", valor: 800 } });

    const { r, dados } = await ok("redigir_mensagem", {
      cliente_id: cliente.id,
      objetivo: "envio_nota",
      nota_id: nota.id,
      conteudo: "Oi! Segue a nota fiscal do serviço, R$ 80.",
    });
    expect(dados.aviso_valores).toEqual(["R$ 80,00"]);
    expect(r.cartao?.tipo).toBe("mensagem");

    const certo = await ok("redigir_mensagem", {
      cliente_id: cliente.id,
      objetivo: "envio_nota",
      nota_id: nota.id,
      conteudo: "Oi! Segue a nota fiscal do serviço, R$ 800,00.",
    });
    expect(certo.dados.aviso_valores).toBeUndefined();
  });

  it("redigir_mensagem envio_nota com nota só preparada → erro da regra do SQL", async () => {
    const { cliente, servico } = await servicoPagoDePj();
    const { dados: nota } = await ok("preparar_nota_fiscal", { servico_id: servico.id });
    const r = await falha("redigir_mensagem", {
      cliente_id: cliente.id,
      objetivo: "envio_nota",
      nota_id: nota.id,
      conteudo: "Segue a nota.",
    });
    expect(r.erro).toBe("só dá para mandar nota já emitida, para o cliente da nota");
  });
});
