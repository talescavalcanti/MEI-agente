import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
});

afterEach(async () => {
  await b.fechar();
});

type Canal = { id: string; mei_id: string; canal: string; conta_id: string };
type Recebida = {
  id: string;
  mei_id: string;
  canal: string;
  conta_id: string;
  remetente_id: string;
  remetente_nome: string | null;
  externo_id: string;
  conteudo: string | null;
  tipo: string;
  recebida_em: string;
};

const conectar = (mei: string, canal: string, conta: string) =>
  b.rpc("canal_conectar", { p_mei: mei, p_canal: canal, p_conta: conta }) as Promise<Canal>;
const registrar = (canal: string, dados: Record<string, unknown>) =>
  b.rpc("mensagem_recebida_registrar", { p_canal: canal, p_dados: dados }) as Promise<string | null>;
const listar = (mei: string) =>
  b.rpc("mensagens_recebidas_listar", { p_mei: mei }) as Promise<Recebida[]>;

const DM = {
  conta_id: "17841429113044909",
  remetente_id: "IGSID-1",
  externo_id: "mid-1",
  conteudo: "Oi, quanto custa a instalação?",
  tipo: "texto",
  recebida_em: "2026-11-13T12:00:00.000Z",
};

describe("canal_conectar", () => {
  it("liga a conta ao MEI e é idempotente", async () => {
    const mei = await criarMei(b);
    const a = await conectar(mei, "instagram", " 17841429113044909 ");
    expect(a).toMatchObject({ mei_id: mei, canal: "instagram", conta_id: "17841429113044909" });
    const de_novo = await conectar(mei, "instagram", "17841429113044909");
    expect(de_novo.id).toBe(a.id);
  });

  it("recusa conta já ligada a outro MEI", async () => {
    const mei = await criarMei(b, "Um");
    const outro = await criarMei(b, "Outro");
    await conectar(mei, "instagram", "123");
    await expect(conectar(outro, "instagram", "123")).rejects.toThrow(/^regra: /);
  });

  it("recusa canal desconhecido e conta vazia", async () => {
    const mei = await criarMei(b);
    await expect(conectar(mei, "telegram", "1")).rejects.toThrow(/^regra: /);
    await expect(conectar(mei, "instagram", "  ")).rejects.toThrow(/^regra: /);
  });
});

describe("mensagem_recebida_registrar", () => {
  it("grava a mensagem no MEI dono da conta", async () => {
    const mei = await criarMei(b);
    await conectar(mei, "instagram", DM.conta_id);
    const id = await registrar("instagram", DM);
    expect(id).toEqual(expect.any(String));
    const [m] = await listar(mei);
    expect(m).toMatchObject({ id, mei_id: mei, canal: "instagram", remetente_id: "IGSID-1", conteudo: DM.conteudo, tipo: "texto" });
    expect(new Date(m.recebida_em).toISOString()).toBe(DM.recebida_em);
  });

  it("ignora conta que não está ligada a nenhum MEI", async () => {
    expect(await registrar("instagram", DM)).toBeNull();
    expect(await b.q("select * from public.mensagens_recebidas")).toHaveLength(0);
  });

  it("mesma mensagem reenviada pela Meta vira um registro só", async () => {
    const mei = await criarMei(b);
    await conectar(mei, "instagram", DM.conta_id);
    const a = await registrar("instagram", DM);
    const c = await registrar("instagram", DM);
    expect(c).toBe(a);
    expect(await listar(mei)).toHaveLength(1);
  });

  it("aceita anexo sem texto e corta texto acima de 2000 caracteres", async () => {
    const mei = await criarMei(b);
    await conectar(mei, "instagram", DM.conta_id);
    await registrar("instagram", { ...DM, externo_id: "mid-2", conteudo: null, tipo: "anexo" });
    await registrar("instagram", { ...DM, externo_id: "mid-3", conteudo: "x".repeat(2500) });
    const lista = await listar(mei);
    expect(lista.find((m) => m.externo_id === "mid-2")).toMatchObject({ conteudo: null, tipo: "anexo" });
    expect(lista.find((m) => m.externo_id === "mid-3")?.conteudo).toHaveLength(2000);
  });
});

describe("mensagens_recebidas_listar", () => {
  it("só devolve as do próprio MEI, da mais nova para a mais antiga", async () => {
    const mei = await criarMei(b, "Um");
    const outro = await criarMei(b, "Outro");
    await conectar(mei, "instagram", "A");
    await conectar(outro, "whatsapp", "B");
    await registrar("instagram", { ...DM, conta_id: "A", externo_id: "1", recebida_em: "2026-11-13T10:00:00Z" });
    await registrar("instagram", { ...DM, conta_id: "A", externo_id: "2", recebida_em: "2026-11-13T11:00:00Z" });
    await registrar("whatsapp", { ...DM, conta_id: "B", externo_id: "3" });
    const lista = await listar(mei);
    expect(lista.map((m) => m.externo_id)).toEqual(["2", "1"]);
  });
});
