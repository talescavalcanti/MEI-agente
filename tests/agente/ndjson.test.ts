import { describe, expect, it } from "vitest";
import { lerEventos, type Evento } from "@/app/painel/agente/ndjson";

/** Corpo de resposta que entrega os pedaços exatamente como vieram. */
function corpo(pedacos: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const p of pedacos) ctrl.enqueue(enc.encode(p));
      ctrl.close();
    },
  });
}

async function todos(body: ReadableStream<Uint8Array>): Promise<Evento[]> {
  const out: Evento[] = [];
  for await (const e of lerEventos(body)) out.push(e);
  return out;
}

describe("lerEventos", () => {
  it("lê uma linha por evento", async () => {
    const eventos = await todos(
      corpo(['{"tipo":"texto","delta":"Oi"}\n{"tipo":"fim","conversaId":"c1"}\n']),
    );
    expect(eventos).toEqual([
      { tipo: "texto", delta: "Oi" },
      { tipo: "fim", conversaId: "c1" },
    ]);
  });

  it("remonta linha partida entre dois chunks", async () => {
    const eventos = await todos(corpo(['{"tipo":"texto","de', 'lta":"Olá"}\n{"tipo":"fim",', '"conversaId":"c2"}\n']));
    expect(eventos).toEqual([
      { tipo: "texto", delta: "Olá" },
      { tipo: "fim", conversaId: "c2" },
    ]);
  });

  it("remonta caractere acentuado partido entre chunks", async () => {
    const bytes = new TextEncoder().encode('{"tipo":"texto","delta":"ção"}\n');
    const meio = bytes.indexOf(0xc3) + 1; // corta no meio do "ç"
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(bytes.slice(0, meio));
        ctrl.enqueue(bytes.slice(meio));
        ctrl.close();
      },
    });
    expect(await todos(body)).toEqual([{ tipo: "texto", delta: "ção" }]);
  });

  it("ignora linha vazia", async () => {
    const eventos = await todos(corpo(['\n\n{"tipo":"texto","delta":"a"}\n', "   \n", "\n"]));
    expect(eventos).toEqual([{ tipo: "texto", delta: "a" }]);
  });

  it("lê a última linha mesmo sem quebra no fim", async () => {
    const eventos = await todos(corpo(['{"tipo":"fim","conversaId":"c3"}']));
    expect(eventos).toEqual([{ tipo: "fim", conversaId: "c3" }]);
  });

  it("JSON inválido vira evento de erro sem lançar", async () => {
    const eventos = await todos(corpo(['{"tipo":"texto",\n{"tipo":"texto","delta":"b"}\n']));
    expect(eventos).toHaveLength(2);
    expect(eventos[0].tipo).toBe("erro");
    expect(eventos[1]).toEqual({ tipo: "texto", delta: "b" });
  });

  it("objeto sem tipo conhecido vira evento de erro", async () => {
    const eventos = await todos(corpo(['{"foo":1}\n', "42\n"]));
    expect(eventos.map((e) => e.tipo)).toEqual(["erro", "erro"]);
  });
});
