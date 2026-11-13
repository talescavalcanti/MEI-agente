import { describe, expect, it } from "vitest";
import { extrairMensagens } from "@/lib/meta/eventos";

const IG = "17841429113044909";

function instagram(messaging: unknown[]) {
  return { object: "instagram", entry: [{ id: IG, time: 1763035200000, messaging }] };
}

describe("extrairMensagens: Instagram", () => {
  it("lê mensagem de texto do Direct", () => {
    const r = extrairMensagens(
      instagram([
        {
          sender: { id: "IGSID-1" },
          recipient: { id: IG },
          timestamp: 1763035200000,
          message: { mid: "mid-1", text: "Oi, vocês atendem sábado?" },
        },
      ]),
    );
    expect(r).toEqual([
      {
        canal: "instagram",
        conta_id: IG,
        remetente_id: "IGSID-1",
        remetente_nome: null,
        externo_id: "mid-1",
        conteudo: "Oi, vocês atendem sábado?",
        tipo: "texto",
        recebida_em: new Date(1763035200000).toISOString(),
      },
    ]);
  });

  it("anexo sem texto vira tipo anexo, sem conteúdo", () => {
    const [m] = extrairMensagens(
      instagram([
        {
          sender: { id: "IGSID-1" },
          recipient: { id: IG },
          timestamp: 1763035200000,
          message: { mid: "mid-2", attachments: [{ type: "image", payload: { url: "https://x" } }] },
        },
      ]),
    );
    expect(m).toMatchObject({ externo_id: "mid-2", conteudo: null, tipo: "anexo" });
  });

  it("ignora eco da própria conta, mensagem apagada, reação e leitura", () => {
    const r = extrairMensagens(
      instagram([
        { sender: { id: IG }, recipient: { id: "IGSID-1" }, timestamp: 1, message: { mid: "eco", text: "resposta", is_echo: true } },
        { sender: { id: "IGSID-1" }, recipient: { id: IG }, timestamp: 1, message: { mid: "apagada", is_deleted: true } },
        { sender: { id: "IGSID-1" }, recipient: { id: IG }, timestamp: 1, reaction: { mid: "x", action: "react" } },
        { sender: { id: "IGSID-1" }, recipient: { id: IG }, timestamp: 1, read: { mid: "x" } },
      ]),
    );
    expect(r).toEqual([]);
  });

  it("usa o id da entrada como conta quando o recipient falta", () => {
    const [m] = extrairMensagens(
      instagram([{ sender: { id: "IGSID-1" }, timestamp: 1763035200000, message: { mid: "m", text: "oi" } }]),
    );
    expect(m.conta_id).toBe(IG);
  });
});

describe("extrairMensagens: WhatsApp", () => {
  const whatsapp = (value: unknown) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value }] }],
  });

  it("lê mensagem de texto com o nome do contato", () => {
    const r = extrairMensagens(
      whatsapp({
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "5581999990000", phone_number_id: "PNID" },
        contacts: [{ profile: { name: "Maria" }, wa_id: "5581988887777" }],
        messages: [{ from: "5581988887777", id: "wamid.1", timestamp: "1763035200", type: "text", text: { body: "Bom dia!" } }],
      }),
    );
    expect(r).toEqual([
      {
        canal: "whatsapp",
        conta_id: "PNID",
        remetente_id: "5581988887777",
        remetente_nome: "Maria",
        externo_id: "wamid.1",
        conteudo: "Bom dia!",
        tipo: "texto",
        recebida_em: new Date(1763035200 * 1000).toISOString(),
      },
    ]);
  });

  it("imagem com legenda guarda a legenda; áudio vira anexo; status é ignorado", () => {
    const r = extrairMensagens(
      whatsapp({
        metadata: { phone_number_id: "PNID" },
        messages: [
          { from: "1", id: "w1", timestamp: "1763035200", type: "image", image: { caption: "Olha o vazamento" } },
          { from: "1", id: "w2", timestamp: "1763035200", type: "audio", audio: { id: "a" } },
          { from: "1", id: "w3", timestamp: "1763035200", type: "button", button: { text: "Confirmo" } },
        ],
        statuses: [{ id: "wamid.x", status: "delivered" }],
      }),
    );
    expect(r.map((m) => [m.externo_id, m.tipo, m.conteudo])).toEqual([
      ["w1", "anexo", "Olha o vazamento"],
      ["w2", "anexo", null],
      ["w3", "texto", "Confirmo"],
    ]);
  });
});

describe("extrairMensagens: entrada estranha", () => {
  it("não lança com corpo fora do formato", () => {
    for (const corpo of [null, 1, "x", {}, { object: "page", entry: [] }, { object: "instagram", entry: "x" }, { object: "instagram", entry: [{ messaging: [null, { message: {} }] }] }]) {
      expect(extrairMensagens(corpo)).toEqual([]);
    }
  });
});
