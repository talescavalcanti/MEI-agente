import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, NotaFiscal, Servico } from "@/lib/dominio/tipos";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

// Mesmas dublês do cartao.test.ts: `db.rpc` responde com o SQL de verdade no
// PGlite; sessão e navegação viram funções de teste.
const h = vi.hoisted(() => ({
  banco: null as unknown as BancoTeste,
  user: null as null | { id: string; email: string; name: string; role: "user" },
}));

vi.mock("@/lib/supabase", () => ({
  db: {
    async rpc(nome: string, args: Record<string, unknown>) {
      try {
        return { data: await h.banco.rpc(nome, args), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  async requireUser() {
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
}));

vi.mock("next/navigation", () => ({
  redirect(url: string): never {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath() {} }));

import { EMISSOR_NACIONAL_URL, dadosEmissao, montarCartaoNota } from "@/app/painel/agente/cartao-dados";
import { decidirNota, prepararNota, registrarEmissao, verNota } from "@/app/painel/agente/actions";

const XML = readFileSync(new URL("../fiscal/fixtures/nfse-exemplo.xml", import.meta.url), "utf8");

function nota(campos: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: randomUUID(),
    mei_id: randomUUID(),
    servico_id: randomUUID(),
    cliente_id: randomUUID(),
    numero_seq: 3,
    valor: 800,
    parcial: false,
    competencia: "2026-11-08",
    descricao: "Manutenção de ar-condicionado",
    codigo_tributacao: "140101",
    nbs: "120018100",
    municipio_prestacao: "Goiânia",
    tomador_documento: "11444777000161",
    avisos: [],
    avisos_confirmados: false,
    status: "rascunho",
    aprovado_em: null,
    aprovado_por: null,
    emitida_em: null,
    numero_nfse: null,
    chave_acesso: null,
    conferencia: null,
    criado_em: "2026-11-13T12:00:00Z",
    atualizado_em: "2026-11-13T12:00:00Z",
    ...campos,
  };
}

const ctx = { clienteNome: "Empresa X", municipioMei: "Anápolis" };

// ---------------------------------------------------------------- lógica pura

describe("montarCartaoNota", () => {
  it("campos na ordem do Emissor Nacional, formatados e com o texto para copiar", () => {
    const c = montarCartaoNota(nota(), ctx);
    expect(c.campos.map((f) => f.rotulo)).toEqual([
      "CNPJ do tomador",
      "Nome do tomador",
      "Competência",
      "Código de tributação nacional",
      "NBS",
      "Município da prestação",
      "Descrição do serviço",
      "Valor do serviço",
    ]);
    const por = Object.fromEntries(c.campos.map((f) => [f.rotulo, f]));
    expect(por["CNPJ do tomador"]).toMatchObject({ valor: "11.444.777/0001-61", copiar: "11.444.777/0001-61" });
    expect(por["Competência"]).toMatchObject({ valor: "08/11/2026", copiar: "08/11/2026" });
    expect(por["Código de tributação nacional"]).toMatchObject({ valor: "14.01.01", copiar: "14.01.01" });
    expect(por["NBS"]).toMatchObject({ valor: "1.2001.81.00" });
    expect(por["Município da prestação"].valor).toBe("Goiânia");
    expect(por["Valor do serviço"]).toMatchObject({ valor: "R$ 800,00", copiar: "800,00" });
    expect(c.titulo).toBe("Nota fiscal nº 3 para Empresa X");
  });

  it("CPF do tomador, NBS ausente fica de fora e município cai no do MEI", () => {
    const c = montarCartaoNota(nota({ tomador_documento: "52998224725", nbs: null, municipio_prestacao: null }), ctx);
    const rotulos = c.campos.map((f) => f.rotulo);
    expect(rotulos[0]).toBe("CPF do tomador");
    expect(c.campos[0].valor).toBe("529.982.247-25");
    expect(rotulos).not.toContain("NBS");
    expect(c.campos.find((f) => f.rotulo === "Município da prestação")?.valor).toBe("Anápolis");
  });

  it("NBS escolhido por descrição (nbs_conferido false) leva 'confira o NBS'", () => {
    const sugerido = montarCartaoNota(nota({ nbs: "120018100" }), ctx);
    expect(sugerido.campos.find((f) => f.rotulo === "NBS")?.observacao).toBe("confira o NBS");
    const outro = montarCartaoNota(nota({ nbs: "101011100" }), ctx);
    expect(outro.campos.find((f) => f.rotulo === "NBS")?.observacao).toBeUndefined();
  });

  it("botões por status", () => {
    expect(montarCartaoNota(nota({ status: "rascunho" }), ctx).botoes).toEqual(["aprovar", "descartar"]);
    expect(montarCartaoNota(nota({ status: "aprovado" }), ctx).botoes).toEqual(["emissor", "registrar"]);
    expect(montarCartaoNota(nota({ status: "divergente" }), ctx).botoes).toEqual(["emissor", "registrar"]);
    expect(montarCartaoNota(nota({ status: "emitida", numero_nfse: "42" }), ctx).botoes).toEqual(["mandar"]);
    expect(montarCartaoNota(nota({ status: "descartado" }), ctx).botoes).toEqual([]);
    expect(montarCartaoNota(nota(), ctx).emissorUrl).toBe(EMISSOR_NACIONAL_URL);
  });

  it("avisos vêm com o código e o texto; confirmação do banco é repassada", () => {
    const avisos = [{ codigo: "possivel_duplicata" as const, texto: "Já existe nota parecida." }];
    const c = montarCartaoNota(nota({ avisos, avisos_confirmados: true }), ctx);
    expect(c.avisos).toEqual(avisos);
    expect(c.avisosConfirmados).toBe(true);
  });

  it("divergente: diferenças formatadas, esperado × emitido", () => {
    const c = montarCartaoNota(
      nota({
        status: "divergente",
        numero_nfse: "42",
        conferencia: {
          valor: { esperado: 800, emitido: 80 },
          tomador_documento: { esperado: "11444777000161", emitido: "11222333000181" },
          competencia: { esperado: "2026-11-08", emitido: "2026-11-01" },
          codigo_tributacao: { esperado: "140101", emitido: "140201" },
        },
      }),
      ctx,
    );
    expect(c.diferencas).toEqual([
      { rotulo: "Valor", esperado: "R$ 800,00", emitido: "R$ 80,00" },
      { rotulo: "CPF ou CNPJ do tomador", esperado: "11.444.777/0001-61", emitido: "11.222.333/0001-81" },
      { rotulo: "Competência", esperado: "08/11/2026", emitido: "01/11/2026" },
      { rotulo: "Código de tributação", esperado: "14.01.01", emitido: "14.02.01" },
    ]);
  });

  it("emitida: número da NFS-e e link para o agente preparar a mensagem com o id da nota", () => {
    const n = nota({ status: "emitida", numero_nfse: "42", emitida_em: "2026-11-10T17:32:05Z" });
    const c = montarCartaoNota(n, ctx);
    expect(c.numeroNfse).toBe("42");
    expect(c.emitidaEm).toBe("10/11/2026");
    expect(c.pedidoEnvio).toMatch(/^\/painel\/agente\?pedido=/);
    expect(decodeURIComponent(c.pedidoEnvio!.split("pedido=")[1])).toContain(n.id);
  });
});

describe("dadosEmissao", () => {
  const xml = (texto: string, nome = "nota.xml", tamanho = texto.length) => ({ xml: { nome, tamanho, texto } });

  it("XML da NFS-e: só os campos extraídos", () => {
    expect(dadosEmissao(xml(XML))).toEqual({
      ok: true,
      dados: {
        numero_nfse: "42",
        chave_acesso: "52087072212345678000195000000000004226111234567890",
        valor: 1500,
        tomador_documento: "11222333000181",
        competencia: "2026-11-08",
        codigo_tributacao: "140101",
      },
    });
  });

  it("arquivo que não é NFS-e, grande demais ou sem .xml → erro amigável", () => {
    expect(dadosEmissao(xml("<nfeProc/>"))).toEqual({ ok: false, erro: "Este arquivo não parece ser uma NFS-e." });
    expect(dadosEmissao(xml(XML, "nota.xml", 201 * 1024))).toEqual({ ok: false, erro: "O arquivo passa de 200 KB." });
    expect(dadosEmissao(xml(XML, "nota.pdf"))).toEqual({ ok: false, erro: "Envie o arquivo XML da nota (.xml)." });
  });

  it("sem arquivo: número e valor digitados", () => {
    expect(dadosEmissao({ numero: " 42 ", valor: "1.500,00" })).toEqual({
      ok: true,
      dados: { numero_nfse: "42", valor: 1500 },
    });
    expect(dadosEmissao({ numero: "", valor: "800" })).toEqual({ ok: false, erro: "Informe o número da NFS-e." });
    expect(dadosEmissao({ numero: "42", valor: "" })).toEqual({ ok: false, erro: "Informe o valor da nota emitida." });
    expect(dadosEmissao({ numero: "42", valor: "abc" })).toEqual({ ok: false, erro: "Valor da nota emitida inválido." });
  });
});

// ---------------------------------------------------------------- actions

describe("actions de nota (PGlite)", () => {
  let b: BancoTeste;

  beforeAll(async () => {
    b = await abrirBancoTeste();
    h.banco = b;
  }, 30_000);
  afterAll(() => b.fechar());

  beforeEach(() => {
    h.user = null;
  });

  /** MEI fiscal logado, cliente PJ do XML de exemplo e serviço de R$ 1.500 pago em 08/11/2026. */
  async function cenario(pago = true) {
    const mei = await criarMei(b, `Refrigeração ${randomUUID().slice(0, 6)}`);
    const [{ user_id }] = await b.q(`select user_id from public.meis where id = $1`, [mei]);
    h.user = { id: user_id, email: "ze@teste.local", name: "Zé", role: "user" };
    await b.rpc("mei_dados_fiscais_salvar", {
      p_mei: mei,
      p_dados: { cnpj: "12.345.678/0001-95", municipio: "Goiânia", codigo_tributacao: "14.01.01" },
    });
    const c = (await b.rpc("cliente_salvar", { p_mei: mei, p_dados: { nome: "Condomínio Exemplo" } })) as Cliente;
    await b.rpc("cliente_documento_salvar", { p_mei: mei, p_cliente: c.id, p_documento: "11.222.333/0001-81" });
    const s = (await b.rpc("servico_registrar", {
      p_mei: mei,
      p_dados: { cliente_id: c.id, descricao: "Manutenção de 3 splits", valor: 1500, fechado: true },
    })) as Servico;
    if (pago) {
      await b.rpc("pagamento_registrar", { p_mei: mei, p_servico: s.id, p_valor: 1500, p_forma: "pix" });
      await b.q(`update public.pagamentos set criado_em = '2026-11-08 12:00:00-03' where servico_id = $1`, [s.id]);
    }
    return { mei, user_id, c, s };
  }

  const form = (campos: Record<string, string | File>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };

  it("prepararNota cria o rascunho e verNota devolve o cartão", async () => {
    const { s } = await cenario();
    const r = await prepararNota(s.id);
    expect("cartao" in r && r.cartao.status).toBe("rascunho");
    if (!("cartao" in r)) return;
    const v = await verNota(r.cartao.id);
    expect(v).toEqual(r);
  });

  it("prepararNota antes do pagamento devolve a frase da regra", async () => {
    const { s } = await cenario(false);
    expect(await prepararNota(s.id)).toEqual({ erro: "A nota só pode ser preparada depois do serviço executado." });
  });

  it("id inválido ou de outro MEI → não encontrada", async () => {
    await cenario();
    expect(await verNota("abc")).toEqual({ erro: "Nota não encontrada." });
    expect(await verNota(randomUUID())).toEqual({ erro: "Nota não encontrada." });
  });

  it("aprovar com avisos sem confirmar é recusado; confirmando, aprova", async () => {
    const { mei, s } = await cenario();
    await b.q(`update public.pagamentos set valor = 1400 where servico_id = $1`, [s.id]);
    const r = await prepararNota(s.id);
    if (!("cartao" in r)) throw new Error(JSON.stringify(r));
    expect(r.cartao.avisos.length).toBeGreaterThan(0);
    expect(await decidirNota(r.cartao.id, "aprovar", false)).toEqual({ erro: "Confirme os avisos antes de aprovar." });
    const ok = await decidirNota(r.cartao.id, "aprovar", true);
    expect("cartao" in ok && ok.cartao.status).toBe("aprovado");
    expect(await b.q(`select status from public.notas_fiscais where mei_id = $1`, [mei])).toEqual([{ status: "aprovado" }]);
  });

  it("registrar com valor digitado errado → divergente; com o XML certo → emitida", async () => {
    const { s } = await cenario();
    const r = await prepararNota(s.id);
    if (!("cartao" in r)) throw new Error(JSON.stringify(r));
    await decidirNota(r.cartao.id, "aprovar", true);

    const errado = await registrarEmissao(r.cartao.id, form({ numero: "42", valor: "150" }));
    expect("cartao" in errado && errado.cartao.status).toBe("divergente");
    if ("cartao" in errado) expect(errado.cartao.diferencas.map((d) => d.rotulo)).toEqual(["Valor"]);

    const arquivo = new File([XML], "nfse.xml", { type: "text/xml" });
    const certo = await registrarEmissao(r.cartao.id, form({ xml: arquivo }));
    expect("cartao" in certo && certo.cartao.status).toBe("emitida");
    if ("cartao" in certo) expect(certo.cartao.numeroNfse).toBe("42");
  });

  it("registrar com arquivo que não é NFS-e → frase amigável, nada muda", async () => {
    const { s } = await cenario();
    const r = await prepararNota(s.id);
    if (!("cartao" in r)) throw new Error(JSON.stringify(r));
    await decidirNota(r.cartao.id, "aprovar", true);
    const arquivo = new File(["<nfeProc/>"], "nfe.xml", { type: "text/xml" });
    expect(await registrarEmissao(r.cartao.id, form({ xml: arquivo }))).toEqual({
      erro: "Este arquivo não parece ser uma NFS-e.",
    });
    const [n] = await b.q(`select status from public.notas_fiscais where id = $1`, [r.cartao.id]);
    expect(n.status).toBe("aprovado");
  });

  it("sem sessão, a action redireciona para o login", async () => {
    await expect(verNota(randomUUID())).rejects.toThrow("REDIRECT:/login");
  });
});
