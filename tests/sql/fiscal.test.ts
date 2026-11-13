import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  Cliente,
  FaturamentoAno,
  FiscalParametros,
  Mei,
  Mensagem,
  NotaAEmitir,
  NotaDecisao,
  NotaEmissaoResultado,
  NotaFiscal,
  NotaListada,
  NotaVista,
  Servico,
} from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

// Números com dígitos verificadores corretos (conferidos fora do SQL).
const CNPJ_MEI = "11.222.333/0001-81";
const CNPJ_CLIENTE = "11.444.777/0001-61";
const CNPJ_OUTRO = "19131243000197";
const CPF = "529.982.247-25";

const regra = (frase?: string) => (frase ? `regra: ${frase}` : /^regra: /);

const docValido = (doc: string | null) => b.rpc("documento_valido", { p_doc: doc }) as Promise<string | null>;
const parametros = (ano?: number) => b.rpc("fiscal_parametros", { p_ano: ano }) as Promise<FiscalParametros>;
const dadosFiscais = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("mei_dados_fiscais_salvar", { p_mei: mei, p_dados: dados }) as Promise<Mei>;
const salvarDoc = (mei: string, cliente: string, doc: string) =>
  b.rpc("cliente_documento_salvar", { p_mei: mei, p_cliente: cliente, p_documento: doc }) as Promise<Cliente>;
const preparar = (mei: string, servico: string, parcial?: number) =>
  b.rpc("nota_preparar", { p_mei: mei, p_servico: servico, p_valor_parcial: parcial }) as Promise<NotaFiscal>;
const decidir = (mei: string, id: string, decisao: string, user: string | null, confirmados?: boolean) =>
  b.rpc("nota_decidir", {
    p_mei: mei,
    p_id: id,
    p_decisao: decisao,
    p_user: user,
    p_avisos_confirmados: confirmados,
  }) as Promise<NotaDecisao>;
const registrar = (mei: string, id: string, dados: Record<string, unknown>) =>
  b.rpc("nota_registrar_emissao", { p_mei: mei, p_id: id, p_dados: dados }) as Promise<NotaEmissaoResultado>;
const ver = (mei: string, id: string) => b.rpc("nota_ver", { p_mei: mei, p_id: id }) as Promise<NotaVista>;
const listar = (mei: string, status?: string) =>
  b.rpc("notas_listar", { p_mei: mei, p_status: status }) as Promise<NotaListada[]>;
const faturamento = (mei: string, ano?: number) =>
  b.rpc("faturamento_ano", { p_mei: mei, p_ano: ano }) as Promise<FaturamentoAno>;
const gerarTarefas = (dias?: number) =>
  b.rpc("tarefas_gerar_notas", { p_dias: dias }) as Promise<{ mei_id: string; tarefa_id: string; servico_id: string }[]>;
const rascunhar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("mensagem_rascunhar", { p_mei: mei, p_dados: dados }) as Promise<Mensagem>;

const dono = async (mei: string) =>
  ((await b.q(`select user_id from public.meis where id = $1`, [mei]))[0] as { user_id: string }).user_id;

/** MEI com dados fiscais completos, em Goiânia. */
async function meiFiscal(nome = "Refrigeração Bueno") {
  const mei = await criarMei(b, nome);
  await dadosFiscais(mei, {
    cnpj: CNPJ_MEI,
    municipio: "Goiânia",
    codigo_tributacao: "14.01.01",
    nbs: "1.2001.81.00",
    descricao_padrao_nota: "Serviço de manutenção",
  });
  return mei;
}

let whats = 0;
/** Cliente do MEI, com documento (ou sem, se `doc` for null). */
async function clienteCom(mei: string, doc: string | null = CNPJ_CLIENTE, nome = "Empresa X") {
  whats += 1;
  const c = (await b.rpc("cliente_salvar", {
    p_mei: mei,
    p_dados: { nome, whatsapp: `6299999${String(whats).padStart(4, "0")}`, endereco: "Rua 1, Goiânia/GO" },
  })) as Cliente;
  if (doc) await salvarDoc(mei, c.id, doc);
  return c;
}

/** Serviço fechado do cliente; `pago` registra o pagamento integral. */
async function servicoDe(mei: string, clienteId: string, valor = 800, estado: "confirmado" | "executado" | "pago" = "pago", local?: string) {
  const s = (await b.rpc("servico_registrar", {
    p_mei: mei,
    p_dados: { cliente_id: clienteId, descricao: "Manutenção de ar-condicionado", valor, fechado: true, local },
  })) as Servico;
  if (estado === "executado") {
    await b.rpc("servico_mudar_status", { p_mei: mei, p_id: s.id, p_para: "executado" });
  } else if (estado === "pago") {
    await b.rpc("pagamento_registrar", { p_mei: mei, p_servico: s.id, p_valor: valor, p_forma: "pix" });
  }
  return s;
}

/** Cenário completo: MEI fiscal, cliente PJ, serviço pago de R$ 800. */
async function cenario(valor = 800) {
  const mei = await meiFiscal();
  const c = await clienteCom(mei);
  const s = await servicoDe(mei, c.id, valor);
  return { mei, c, s, user: await dono(mei) };
}

/** Nota preparada, aprovada e registrada como emitida. */
async function notaEmitida(mei: string, servico: string, user: string) {
  const n = await preparar(mei, servico);
  await decidir(mei, n.id, "aprovar", user, true);
  await registrar(mei, n.id, { numero_nfse: "123", valor: n.valor });
  return n;
}

describe("schema", () => {
  it("colunas e checks novos nas tabelas de 02, 04 e 05", async () => {
    const cols = await b.q(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and (table_name, column_name) in
         (('meis','cnpj'),('meis','codigo_tributacao'),('clientes','documento'),('mensagens','nota_id'))`,
    );
    expect(cols).toHaveLength(4);
  });
});

// Mesmos casos de tests/fiscal/documento.test.ts (Task 17b, documentoValido em
// TS): os dois algoritmos precisam aceitar e recusar exatamente as mesmas
// entradas. [entrada, esperado]
const CASOS_DOCUMENTO: [string | null, string | null][] = [
  // CPF e CNPJ válidos conhecidos
  ["52998224725", "52998224725"],
  ["12345678909", "12345678909"],
  ["11222333000181", "11222333000181"],
  ["12345678000195", "12345678000195"],
  // formatação com pontos, traço, barra e espaço
  ["529.982.247-25", "52998224725"],
  [" 11.222.333/0001-81 ", "11222333000181"],
  // um dígito trocado
  ["52998224724", null],
  ["52998224735", null],
  ["11222333000182", null],
  ["11222333000191", null],
  ["62998224725", null],
  // sequência repetida, mesmo com DV que fecha
  ["111.111.111-11", null],
  ["00000000000", null],
  ["99999999999", null],
  ["00000000000000", null],
  ["11111111111111", null],
  // tamanho errado, vazio ou nulo
  ["", null],
  ["5299822472", null],
  ["529982247250", null],
  ["1122233300018", null],
  ["112223330001810", null],
  [null, null],
  // CNPJ alfanumérico (IN RFB 2.229/2024): exemplo oficial Serpro/Receita
  ["12.ABC.345/01DE-35", "12ABC34501DE35"],
  ["12ABC34501DE35", "12ABC34501DE35"],
  ["12.abc.345/01de-35", "12ABC34501DE35"],
  // um caractere trocado
  ["12ABD34501DE35", null],
  ["12ABC34501DE36", null],
  ["12ABC34501DF35", null],
  // DV com letra, CPF com letra ou caractere estranho
  ["12ABC34501DE3A", null],
  ["5299822472A", null],
  ["12ABC34501DE#35", null],
  ["529.982.247-25abc", null],
];

describe("documento_valido", () => {
  it("aceita e recusa exatamente os mesmos casos do documentoValido (17b)", async () => {
    const obtido = [];
    for (const [entrada] of CASOS_DOCUMENTO) obtido.push([entrada, await docValido(entrada)]);
    expect(obtido).toEqual(CASOS_DOCUMENTO);
  });
});

describe("fiscal_parametros", () => {
  it("limite muda por ano (LC 238/2026): 81 mil até 2026, 110 mil em 2027, 140 mil a partir de 2028", async () => {
    expect(await parametros(2025)).toMatchObject({ ano: 2025, limite_anual: 81000 });
    expect(await parametros(2026)).toEqual({
      ano: 2026,
      limite_anual: 81000,
      tolerancia_excesso: 0.2,
      dias_para_emitir: 5,
      dias_duplicata: 30,
    });
    expect(await parametros(2027)).toMatchObject({ ano: 2027, limite_anual: 110000, tolerancia_excesso: 0.2 });
    expect(await parametros(2028)).toMatchObject({ ano: 2028, limite_anual: 140000 });
    expect(await parametros(2031)).toMatchObject({ ano: 2031, limite_anual: 140000 });
  });

  it("sem ano, usa o ano de hoje em São Paulo", async () => {
    const [{ ano }] = await b.q(`select extract(year from public.hoje_sp())::int as ano`);
    expect((await parametros()).ano).toBe(ano);
  });
});

describe("mei_dados_fiscais_salvar", () => {
  it("normaliza CNPJ, código de tributação e NBS; campo ausente não apaga", async () => {
    const mei = await criarMei(b);
    const m = await dadosFiscais(mei, {
      cnpj: CNPJ_MEI,
      inscricao_municipal: "12345",
      municipio: "Goiânia",
      codigo_tributacao: "14.01.01",
      nbs: "1.2001.81.00",
    });
    expect(m).toMatchObject({
      cnpj: "11222333000181",
      inscricao_municipal: "12345",
      municipio: "Goiânia",
      codigo_tributacao: "140101",
      nbs: "120018100",
    });
    // Planilha oficial grava sem o zero à esquerda.
    const m2 = await dadosFiscais(mei, { codigo_tributacao: "10101" });
    expect(m2).toMatchObject({ codigo_tributacao: "010101", cnpj: "11222333000181", nbs: "120018100" });
  });

  it("aceita CNPJ alfanumérico, gravado em maiúsculas", async () => {
    const mei = await criarMei(b);
    expect((await dadosFiscais(mei, { cnpj: "12.abc.345/01de-35" })).cnpj).toBe("12ABC34501DE35");
  });

  it("CNPJ inválido, CPF no lugar de CNPJ, código ou NBS fora do formato → regra", async () => {
    const mei = await criarMei(b);
    await expect(dadosFiscais(mei, { cnpj: "11.222.333/0001-82" })).rejects.toThrow(regra("CNPJ do negócio inválido"));
    await expect(dadosFiscais(mei, { cnpj: CPF })).rejects.toThrow(regra("CNPJ do negócio inválido"));
    await expect(dadosFiscais(mei, { codigo_tributacao: "1401" })).rejects.toThrow(regra());
    await expect(dadosFiscais(mei, { codigo_tributacao: "14.01.01.1" })).rejects.toThrow(regra());
    await expect(dadosFiscais(mei, { nbs: "12345" })).rejects.toThrow(regra());
  });
});

describe("cliente_documento_salvar (Review Focus 3)", () => {
  it("salva só dígitos; dígito errado → regra; repetido em outro cliente → regra", async () => {
    const mei = await meiFiscal();
    const a = await clienteCom(mei, null, "A");
    const c = await clienteCom(mei, null, "C");
    expect((await salvarDoc(mei, a.id, CPF)).documento).toBe("52998224725");
    await expect(salvarDoc(mei, c.id, "11.444.777/0001-62")).rejects.toThrow(regra("CPF ou CNPJ inválido"));
    await expect(salvarDoc(mei, c.id, "52998224725")).rejects.toThrow(
      regra("já existe outro cliente com esse CPF/CNPJ"),
    );
  });

  it("CNPJ alfanumérico: normalizado, conta como PJ e entra na conferência da emissão", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei, null);
    expect((await salvarDoc(mei, c.id, "12.abc.345/01de-35")).documento).toBe("12ABC34501DE35");
    await expect(salvarDoc(mei, c.id, "12.ABC.345/01DF-35")).rejects.toThrow(regra("CPF ou CNPJ inválido"));

    const s = await servicoDe(mei, c.id);
    const n = await preparar(mei, s.id);
    expect(n.tomador_documento).toBe("12ABC34501DE35");
    await decidir(mei, n.id, "aprovar", await dono(mei));
    // Mesmo documento formatado e minúsculo bate; outro documento diverge.
    expect(await registrar(mei, n.id, { numero_nfse: "1", tomador_documento: "12.abc.345/01de-35" })).toEqual({
      status: "emitida",
      diferencas: {},
    });

    await b.q(`update public.pagamentos set criado_em = now() - interval '6 days' where servico_id = $1`, [s.id]);
    const s2 = await servicoDe(mei, c.id, 900);
    await b.q(`update public.pagamentos set criado_em = now() - interval '6 days' where servico_id = $1`, [s2.id]);
    expect(await gerarTarefas()).toEqual([expect.objectContaining({ servico_id: s2.id })]);
  });

  it("cliente de outro MEI → regra: cliente não encontrado", async () => {
    const mei = await meiFiscal();
    const a = await clienteCom(mei, null);
    const outro = await criarMei(b, "Outro");
    await expect(salvarDoc(outro, a.id, CPF)).rejects.toThrow(regra("cliente não encontrado"));
  });
});

describe("nota_preparar", () => {
  it("cliente sem documento → regra: informe o CPF ou CNPJ do cliente (Review Focus 3)", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei, null);
    const s = await servicoDe(mei, c.id);
    await expect(preparar(mei, s.id)).rejects.toThrow(regra("informe o CPF ou CNPJ do cliente"));
  });

  it("serviço confirmado → regra", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei);
    const s = await servicoDe(mei, c.id, 800, "confirmado");
    await expect(preparar(mei, s.id)).rejects.toThrow(
      regra("a nota só pode ser preparada depois do serviço executado"),
    );
  });

  it("MEI sem dados fiscais → regra", async () => {
    const mei = await criarMei(b);
    const c = await clienteCom(mei);
    const s = await servicoDe(mei, c.id);
    await expect(preparar(mei, s.id)).rejects.toThrow(regra("complete os dados fiscais em Meu negócio"));
  });

  it("serviço pago → rascunho com valor, tomador, códigos e competência do banco, sem avisos", async () => {
    const { mei, c, s } = await cenario();
    const n = await preparar(mei, s.id);
    const [{ hoje }] = await b.q(`select public.hoje_sp()::text as hoje`);
    expect(n).toMatchObject({
      servico_id: s.id,
      cliente_id: c.id,
      numero_seq: 1,
      valor: 800,
      parcial: false,
      competencia: hoje,
      tomador_documento: "11444777000161",
      codigo_tributacao: "140101",
      nbs: "120018100",
      municipio_prestacao: "Goiânia",
      status: "rascunho",
      avisos: [],
      avisos_confirmados: false,
      numero_nfse: null,
    });
    expect(n.descricao).toContain("Manutenção de ar-condicionado");
  });

  it("serviço executado e ainda não pago → aviso pagamento_diferente", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei);
    const s = await servicoDe(mei, c.id, 800, "executado");
    const n = await preparar(mei, s.id);
    expect(n.avisos.map((a) => a.codigo)).toEqual(["pagamento_diferente"]);
  });

  it("local do serviço em outra cidade → aviso municipio_diferente", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei);
    const s = await servicoDe(mei, c.id, 800, "pago", "Rua 2, Anápolis/GO");
    const n = await preparar(mei, s.id);
    expect(n.avisos.map((a) => a.codigo)).toContain("municipio_diferente");
  });

  it("faturamento do ano passando de 90% do limite → aviso limite_90", async () => {
    const { mei, c } = await cenario();
    const s = await servicoDe(mei, c.id, 75000);
    const n = await preparar(mei, s.id);
    expect(n.avisos.map((a) => a.codigo)).toContain("limite_90");
  });

  it("Review Focus 2: preparar duas vezes devolve a mesma nota", async () => {
    const { mei, s } = await cenario();
    const n1 = await preparar(mei, s.id);
    const n2 = await preparar(mei, s.id);
    expect(n2.id).toBe(n1.id);
    const [{ total }] = await b.q(`select count(*)::int as total from public.notas_fiscais where servico_id = $1`, [s.id]);
    expect(total).toBe(1);
  });

  it("nota já aprovada não é refeita", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    await expect(preparar(mei, s.id)).rejects.toThrow(regra());
  });

  it("Review Focus 1: parciais não passam do valor do serviço", async () => {
    const { mei, s } = await cenario();
    await preparar(mei, s.id, 500);
    await expect(preparar(mei, s.id, 400)).rejects.toThrow(regra("o valor das notas passa do valor do serviço"));
    // Também não cabe a nota inteira por cima da parcial.
    await expect(preparar(mei, s.id)).rejects.toThrow(regra("o valor das notas passa do valor do serviço"));
  });

  it("Review Focus 1: parcial 300 + 500 em serviço de 800 é aceita", async () => {
    const { mei, s } = await cenario();
    const p1 = await preparar(mei, s.id, 300);
    const p2 = await preparar(mei, s.id, 500);
    expect([p1.valor, p2.valor, p1.parcial, p2.parcial]).toEqual([300, 500, true, true]);
    expect(p2.numero_seq).toBe(2);
  });

  it("parcial ≤ 0 → regra", async () => {
    const { mei, s } = await cenario();
    await expect(preparar(mei, s.id, 0)).rejects.toThrow(regra());
    await expect(preparar(mei, s.id, -10)).rejects.toThrow(regra());
  });

  it("serviço de outro MEI → regra: serviço não encontrado", async () => {
    const { s } = await cenario();
    const outro = await meiFiscal("Outro");
    await expect(preparar(outro, s.id)).rejects.toThrow(regra("serviço não encontrado"));
  });
});

describe("nota_decidir (Review Focus 6)", () => {
  it("nota com possível duplicata: sem confirmação → regra; com confirmação aprova; repetir → mudou false", async () => {
    const { mei, c, s, user } = await cenario();
    await preparar(mei, s.id);
    const s2 = await servicoDe(mei, c.id, 800);
    const n = await preparar(mei, s2.id);
    expect(n.avisos.map((a) => a.codigo)).toContain("possivel_duplicata");

    await expect(decidir(mei, n.id, "aprovar", user)).rejects.toThrow(regra("confirme os avisos antes de aprovar"));
    await expect(decidir(mei, n.id, "aprovar", user, false)).rejects.toThrow(regra());

    expect(await decidir(mei, n.id, "aprovar", user, true)).toEqual({ id: n.id, status: "aprovado", mudou: true });
    const [a1] = await b.q(`select aprovado_em, aprovado_por, avisos_confirmados from public.notas_fiscais where id = $1`, [n.id]);
    expect(a1.aprovado_por).toBe(user);
    expect(a1.avisos_confirmados).toBe(true);

    expect(await decidir(mei, n.id, "aprovar", user, true)).toEqual({ id: n.id, status: "aprovado", mudou: false });
    const [a2] = await b.q(`select aprovado_em from public.notas_fiscais where id = $1`, [n.id]);
    expect(a2.aprovado_em).toEqual(a1.aprovado_em);
  });

  it("grava a decisão em agente_acoes, só quando muda", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    await decidir(mei, n.id, "aprovar", user);
    const acoes = await b.q(`select tipo, nome, entrada, user_id from public.agente_acoes where mei_id = $1`, [mei]);
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ tipo: "decisao", nome: "aprovar", user_id: user });
    expect(acoes[0].entrada).toMatchObject({ tipo: "nota", id: n.id });
  });

  it("descartar libera preparar outra nota; aprovar depois de descartar não muda", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    expect(await decidir(mei, n.id, "descartar", user)).toMatchObject({ status: "descartado", mudou: true });
    expect(await decidir(mei, n.id, "aprovar", user, true)).toMatchObject({ status: "descartado", mudou: false });
    const n2 = await preparar(mei, s.id);
    expect(n2.id).not.toBe(n.id);
  });

  it("nota de outro MEI ou decisão inválida → regra", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    const outro = await meiFiscal("Outro");
    await expect(decidir(outro, n.id, "aprovar", user)).rejects.toThrow(regra("nota não encontrada"));
    await expect(decidir(mei, n.id, "emitir", user)).rejects.toThrow(regra());
  });
});

describe("nota_registrar_emissao", () => {
  it("nota em rascunho → regra: aprove a nota antes de registrar a emissão", async () => {
    const { mei, s } = await cenario();
    const n = await preparar(mei, s.id);
    await expect(registrar(mei, n.id, { numero_nfse: "1" })).rejects.toThrow(
      regra("aprove a nota antes de registrar a emissão"),
    );
  });

  it("número vazio → regra", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    await expect(registrar(mei, n.id, { numero_nfse: "  " })).rejects.toThrow(regra());
  });

  it("Review Focus 4: valor diferente → divergente com conferência e tarefa; corrigida → emitida", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);

    const r1 = await registrar(mei, n.id, { numero_nfse: "77", valor: 80, tomador_documento: CNPJ_CLIENTE });
    expect(r1).toEqual({ status: "divergente", diferencas: { valor: { esperado: 800, emitido: 80 } } });
    const [nota] = await b.q(`select status, conferencia, numero_nfse from public.notas_fiscais where id = $1`, [n.id]);
    expect(nota).toMatchObject({ status: "divergente", numero_nfse: "77", conferencia: { valor: { esperado: 800, emitido: 80 } } });
    const abertas = async () =>
      (
        await b.q(
          `select count(*)::int as n from public.tarefas where servico_id = $1 and tipo = 'corrigir_nota' and status = 'aberta'`,
          [s.id],
        )
      )[0].n;
    expect(await abertas()).toBe(1);

    // Registrar a mesma divergência de novo não duplica a tarefa.
    await registrar(mei, n.id, { numero_nfse: "77", valor: 80 });
    expect(await abertas()).toBe(1);

    const r2 = await registrar(mei, n.id, { numero_nfse: "78", valor: 800, chave_acesso: "CHAVE78" });
    expect(r2).toEqual({ status: "emitida", diferencas: {} });
    const [ok] = await b.q(`select status, numero_nfse, chave_acesso, emitida_em from public.notas_fiscais where id = $1`, [n.id]);
    expect(ok).toMatchObject({ status: "emitida", numero_nfse: "78", chave_acesso: "CHAVE78" });
    expect(ok.emitida_em).not.toBeNull();
    expect(await abertas()).toBe(0);
  });

  it("compara tomador, competência e código de tributação", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    const r = await registrar(mei, n.id, {
      numero_nfse: "9",
      tomador_documento: CPF,
      competencia: "2020-01-01",
      codigo_tributacao: "14.01.02",
    });
    expect(r.status).toBe("divergente");
    expect(Object.keys(r.diferencas).sort()).toEqual(["codigo_tributacao", "competencia", "tomador_documento"]);
    expect(r.diferencas.tomador_documento).toEqual({ esperado: "11444777000161", emitido: "52998224725" });
  });

  it("emitida de novo com os mesmos dados é idempotente; com outros dados → regra", async () => {
    const { mei, s, user } = await cenario();
    const n = await notaEmitida(mei, s.id, user);
    const [antes] = await b.q(`select emitida_em from public.notas_fiscais where id = $1`, [n.id]);
    expect(await registrar(mei, n.id, { numero_nfse: "123", valor: 800 })).toEqual({ status: "emitida", diferencas: {} });
    const [depois] = await b.q(`select emitida_em from public.notas_fiscais where id = $1`, [n.id]);
    expect(depois.emitida_em).toEqual(antes.emitida_em);
    await expect(registrar(mei, n.id, { numero_nfse: "999" })).rejects.toThrow(regra());
  });

  it("nota de outro MEI → regra: nota não encontrada", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    const outro = await meiFiscal("Outro");
    await expect(registrar(outro, n.id, { numero_nfse: "1" })).rejects.toThrow(regra("nota não encontrada"));
  });
});

describe("mensagem de envio de nota (Review Focus 5)", () => {
  it("só com nota emitida e para o cliente da nota", async () => {
    const { mei, c, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    const base = { canal: "whatsapp", objetivo: "envio_nota", conteudo: "Segue a nota" };

    await expect(rascunhar(mei, { ...base, nota_id: n.id })).rejects.toThrow(
      regra("só dá para mandar nota já emitida, para o cliente da nota"),
    );

    await registrar(mei, n.id, { numero_nfse: "5", valor: 800 });
    const outroCliente = await clienteCom(mei, CPF, "Outra pessoa");
    await expect(rascunhar(mei, { ...base, nota_id: n.id, cliente_id: outroCliente.id })).rejects.toThrow(
      regra("só dá para mandar nota já emitida, para o cliente da nota"),
    );
    await expect(rascunhar(mei, base)).rejects.toThrow(regra());

    const m = await rascunhar(mei, { ...base, nota_id: n.id, cliente_id: c.id });
    expect(m).toMatchObject({ objetivo: "envio_nota", nota_id: n.id, cliente_id: c.id, servico_id: s.id });
    // Sem cliente_id, usa o cliente da nota.
    const m2 = await rascunhar(mei, { ...base, nota_id: n.id });
    expect(m2.cliente_id).toBe(c.id);
  });

  it("vale também para insert direto na tabela (trigger)", async () => {
    const { mei, s } = await cenario();
    const n = await preparar(mei, s.id);
    await expect(
      b.q(
        `insert into public.mensagens (mei_id, canal, objetivo, conteudo, nota_id) values ($1, 'whatsapp', 'envio_nota', 'x', $2)`,
        [mei, n.id],
      ),
    ).rejects.toThrow(regra());
  });

  it("nota de outro MEI → regra: nota não encontrada", async () => {
    const { mei, s, user } = await cenario();
    const n = await notaEmitida(mei, s.id, user);
    const outro = await meiFiscal("Outro");
    await expect(
      rascunhar(outro, { canal: "whatsapp", objetivo: "envio_nota", conteudo: "x", nota_id: n.id }),
    ).rejects.toThrow(regra("nota não encontrada"));
  });

  it("mensagens antigas continuam funcionando", async () => {
    const { mei } = await cenario();
    const m = await rascunhar(mei, { canal: "whatsapp", objetivo: "outro", conteudo: "oi" });
    expect(m.nota_id).toBeNull();
  });
});

describe("nota_ver e notas_listar", () => {
  it("nota_ver devolve nota, mei, cliente e serviço; outro MEI → regra", async () => {
    const { mei, c, s } = await cenario();
    const n = await preparar(mei, s.id);
    const v = await ver(mei, n.id);
    expect(v.nota).toMatchObject({ id: n.id, valor: 800 });
    expect(v.mei).toMatchObject({ nome: "Refrigeração Bueno", cnpj: "11222333000181", municipio: "Goiânia" });
    expect(v.mei).not.toHaveProperty("user_id");
    expect(v.cliente).toMatchObject({ id: c.id, documento: "11444777000161" });
    expect(v.servico).toMatchObject({ id: s.id, numero: s.numero });

    const outro = await meiFiscal("Outro");
    await expect(ver(outro, n.id)).rejects.toThrow(regra("nota não encontrada"));
  });

  it("notas_listar traz cliente e número do serviço, filtra por status e por MEI", async () => {
    const { mei, s, user } = await cenario();
    const n = await preparar(mei, s.id);
    await decidir(mei, n.id, "aprovar", user);
    const lista = await listar(mei);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: n.id, cliente_nome: "Empresa X", servico_numero: s.numero, status: "aprovado" });
    expect(await listar(mei, "rascunho")).toHaveLength(0);
    expect(await listar(mei, "aprovado")).toHaveLength(1);
    const outro = await meiFiscal("Outro");
    expect(await listar(outro)).toHaveLength(0);
  });
});

describe("faturamento_ano", () => {
  it("30 mil + 35 mil com nota emitida de 30 mil → faixa atencao", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei);
    const user = await dono(mei);
    const s1 = await servicoDe(mei, c.id, 30000);
    await servicoDe(mei, c.id, 35000);
    await notaEmitida(mei, s1.id, user);

    const f = await faturamento(mei);
    const [{ ano }] = await b.q(`select extract(year from public.hoje_sp())::int as ano`);
    expect(f).toMatchObject({ ano, total: 65000, com_nota: 30000, sem_nota: 35000, limite: 81000, faixa: "atencao" });
    expect(f.percentual).toBeCloseTo(80.2, 1);
    expect(f.projecao).toBeGreaterThanOrEqual(65000);
  });

  it("ano sem pagamentos → zero e faixa ok; usa o limite do ano pedido", async () => {
    const mei = await meiFiscal();
    expect(await faturamento(mei, 2027)).toMatchObject({
      ano: 2027,
      total: 0,
      com_nota: 0,
      sem_nota: 0,
      limite: 110000,
      percentual: 0,
      faixa: "ok",
    });
    expect((await faturamento(mei, 2028)).limite).toBe(140000);
  });

  it("faixas: alerta, excedido, excedido_grave", async () => {
    const mei = await meiFiscal();
    const c = await clienteCom(mei);
    await servicoDe(mei, c.id, 74000);
    expect((await faturamento(mei)).faixa).toBe("alerta");
    await servicoDe(mei, c.id, 10000);
    expect((await faturamento(mei)).faixa).toBe("excedido");
    await servicoDe(mei, c.id, 20000);
    expect((await faturamento(mei)).faixa).toBe("excedido_grave");
  });

  it("isolado por MEI", async () => {
    await cenario(5000);
    const outro = await meiFiscal("Outro");
    expect((await faturamento(outro)).total).toBe(0);
  });
});

describe("tarefas_gerar_notas", () => {
  const envelhecer = (servico: string, dias: number) =>
    b.q(`update public.pagamentos set criado_em = now() - make_interval(days => $2) where servico_id = $1`, [servico, dias]);

  it("serviço pago de PJ há 6 dias → 1 tarefa; rodar de novo → continua 1", async () => {
    const { mei, s } = await cenario();
    await envelhecer(s.id, 6);
    const r1 = await gerarTarefas();
    expect(r1).toEqual([expect.objectContaining({ mei_id: mei, servico_id: s.id })]);
    expect(await gerarTarefas()).toEqual([]);
    const [{ n }] = await b.q(`select count(*)::int as n from public.tarefas where tipo = 'emitir_nota'`);
    expect(n).toBe(1);
  });

  it("pago há 2 dias, cliente PF ou serviço com nota emitida não geram", async () => {
    const { mei, s, user } = await cenario();
    await envelhecer(s.id, 2);
    const pf = await clienteCom(mei, CPF, "Pessoa");
    const sPf = await servicoDe(mei, pf.id);
    await envelhecer(sPf.id, 6);
    const pj = await clienteCom(mei, CNPJ_OUTRO, "Empresa Y");
    const sNota = await servicoDe(mei, pj.id, 900);
    await notaEmitida(mei, sNota.id, user);
    await envelhecer(sNota.id, 6);
    expect(await gerarTarefas()).toEqual([]);
  });

  it("nota emitida fecha a tarefa emitir_nota aberta", async () => {
    const { mei, s, user } = await cenario();
    await envelhecer(s.id, 6);
    await gerarTarefas();
    await notaEmitida(mei, s.id, user);
    const [t] = await b.q(`select status from public.tarefas where servico_id = $1 and tipo = 'emitir_nota'`, [s.id]);
    expect(t.status).toBe("feita");
  });
});

describe("notas_a_emitir", () => {
  const envelhecer = (servico: string, dias: number) =>
    b.q(`update public.pagamentos set criado_em = now() - make_interval(days => $2) where servico_id = $1`, [servico, dias]);
  const aEmitir = (mei: string) => b.rpc("notas_a_emitir", { p_mei: mei }) as Promise<NotaAEmitir[]>;

  it("serviço pago de PJ há 6 dias + tarefas_gerar_notas → 1 linha com serviço e cliente", async () => {
    const { mei, c, s } = await cenario();
    await envelhecer(s.id, 6);
    expect(await aEmitir(mei)).toEqual([]);
    const [gerada] = await gerarTarefas();
    expect(await aEmitir(mei)).toEqual([
      {
        tarefa_id: gerada.tarefa_id,
        servico_id: s.id,
        numero: s.numero,
        descricao: "Manutenção de ar-condicionado",
        valor: 800,
        cliente_id: c.id,
        cliente_nome: "Empresa X",
        vencimento: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        dias_desde_pagamento: 6,
      },
    ]);
  });

  it("outro MEI não vê a tarefa", async () => {
    const { s } = await cenario();
    await envelhecer(s.id, 6);
    await gerarTarefas();
    const outro = await meiFiscal("Outro MEI");
    expect(await aEmitir(outro)).toEqual([]);
  });

  it("tarefa feita (nota emitida) ou ignorada some da lista", async () => {
    const { mei, s, user } = await cenario();
    await envelhecer(s.id, 6);
    await gerarTarefas();
    await notaEmitida(mei, s.id, user);
    expect(await aEmitir(mei)).toEqual([]);

    const c2 = await clienteCom(mei, CNPJ_OUTRO, "Empresa Y");
    const s2 = await servicoDe(mei, c2.id, 500);
    await envelhecer(s2.id, 6);
    const [t2] = await gerarTarefas();
    expect(await aEmitir(mei)).toHaveLength(1);
    await b.q(`update public.tarefas set status = 'ignorada' where id = $1`, [t2.tarefa_id]);
    expect(await aEmitir(mei)).toEqual([]);
  });
});
