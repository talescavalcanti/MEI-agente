import type { ModelMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  anexarMensagens,
  criarConversa,
  historico,
  lerConversa,
  listarConversas,
  registrarAcao,
  tituloDe,
} from "@/lib/agente/conversas";
import { limiteAtingido, somarUso, usoHoje } from "@/lib/agente/uso";
import { abrirBancoTeste, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

describe("conversas.ts", () => {
  it("cria, anexa e devolve o histórico como veio", async () => {
    const mei = await criarMei(b);
    const c = await criarConversa(b.rpc, mei, { origem: "chat", titulo: "oi" });
    expect(c).toMatchObject({ mei_id: mei, titulo: "oi", origem: "chat" });

    const msgs: ModelMessage[] = [
      { role: "user", content: "oi" },
      { role: "assistant", content: [{ type: "text", text: "Olá!" }] },
    ];
    await anexarMensagens(b.rpc, mei, c.id, [
      { mensagem: msgs[0] },
      { mensagem: msgs[1], cartoes: [{ tipo: "mensagem", id: "abc" }] },
    ]);

    const linhas = await lerConversa(b.rpc, mei, c.id);
    expect(linhas.map((l) => l.role)).toEqual(["user", "assistant"]);
    expect(linhas[1].cartoes).toEqual([{ tipo: "mensagem", id: "abc" }]);
    expect(historico(linhas)).toEqual(msgs);
    expect((await listarConversas(b.rpc, mei)).map((x) => x.id)).toEqual([c.id]);
  });

  it("anexar lista vazia não chama o banco", async () => {
    let chamadas = 0;
    await anexarMensagens(async () => void chamadas++, "m", "c", []);
    expect(chamadas).toBe(0);
  });

  it("registrarAcao grava a auditoria", async () => {
    const mei = await criarMei(b);
    const c = await criarConversa(b.rpc, mei, { titulo: "x" });
    await registrarAcao(b.rpc, mei, {
      conversaId: c.id,
      tipo: "ferramenta",
      nome: "buscar_cliente",
      entrada: { termo: "a" },
      saida: { conteudo: "[]" },
      erro: false,
    });
    const [a] = await b.q(`select tipo, nome, entrada, erro from public.agente_acoes`);
    expect(a).toEqual({ tipo: "ferramenta", nome: "buscar_cliente", entrada: { termo: "a" }, erro: false });
  });

  it("tituloDe usa a primeira linha, sem espaços extras, com no máximo 60 caracteres", () => {
    expect(tituloDe("  Troca de   fiação\nno Carlos ")).toBe("Troca de fiação");
    expect(tituloDe("a".repeat(100))).toBe(`${"a".repeat(59)}…`);
    expect(tituloDe("   ")).toBe("Nova conversa");
  });
});

describe("uso.ts", () => {
  it("soma o uso do dia e diz quando o limite foi atingido", async () => {
    const mei = await criarMei(b);
    expect(await usoHoje(b.rpc, mei)).toBe(0);
    expect(await limiteAtingido(b.rpc, mei, 100)).toBe(false);
    await somarUso(b.rpc, mei, { entrada: 80, saida: 20 });
    expect(await usoHoje(b.rpc, mei)).toBe(100);
    expect(await limiteAtingido(b.rpc, mei, 100)).toBe(true);
    expect(await limiteAtingido(b.rpc, mei, 101)).toBe(false);
  });

  it("uso zerado não chama o banco", async () => {
    let chamadas = 0;
    await somarUso(async () => void chamadas++, "m", { entrada: 0, saida: 0 });
    expect(chamadas).toBe(0);
  });
});
