import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBancoTeste, carregarSql, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

type Conversa = { id: string; mei_id: string; titulo: string; origem: string; criado_em: string };
type Linha = { id: number; conversa_id: string; role: string; content: unknown; cartoes: unknown; criado_em: string };
type Acao = {
  id: string;
  mei_id: string;
  conversa_id: string | null;
  tipo: string;
  nome: string;
  entrada: unknown;
  saida: unknown;
  erro: boolean;
  user_id: string | null;
};

const regra = (frase?: string) => (frase ? `regra: ${frase}` : /^regra: /);

const criar = (mei: string, titulo = "Conversa", origem = "chat") =>
  b.rpc("conversa_criar", { p_mei: mei, p_origem: origem, p_titulo: titulo }) as Promise<Conversa>;
const anexar = (mei: string, conversa: string, role: string, content: unknown, cartoes?: unknown) =>
  b.rpc("conversa_anexar", {
    p_mei: mei,
    p_conversa: conversa,
    p_role: role,
    p_content: content,
    p_cartoes: cartoes,
  }) as Promise<Linha>;
const anexarVarias = (mei: string, conversa: string, mensagens: unknown) =>
  b.rpc("conversa_anexar_varias", { p_mei: mei, p_conversa: conversa, p_mensagens: mensagens }) as Promise<Linha[]>;
const ler = (mei: string, conversa: string) =>
  b.rpc("conversa_ler", { p_mei: mei, p_conversa: conversa }) as Promise<Linha[]>;
const listar = (mei: string) => b.rpc("conversa_listar", { p_mei: mei }) as Promise<Conversa[]>;

const dono = async (mei: string) =>
  ((await b.q(`select user_id from public.meis where id = $1`, [mei]))[0] as { user_id: string }).user_id;

describe("06-agente.sql", () => {
  it("roda de novo sobre o mesmo banco sem erro (idempotente)", async () => {
    await expect(carregarSql(b.pg)).resolves.toBeUndefined();
  });

  it("tabelas com RLS ligado", async () => {
    const rows = await b.q(
      `select relname, relrowsecurity from pg_class
       where relname in ('conversas','conversa_mensagens','agente_acoes','agente_uso','memorias')
       order by relname`,
    );
    expect(rows).toEqual([
      { relname: "agente_acoes", relrowsecurity: true },
      { relname: "agente_uso", relrowsecurity: true },
      { relname: "conversa_mensagens", relrowsecurity: true },
      { relname: "conversas", relrowsecurity: true },
      { relname: "memorias", relrowsecurity: true },
    ]);
  });
});

describe("conversas", () => {
  it("cria, anexa e lê na ordem, com content intacto", async () => {
    const mei = await criarMei(b);
    const c = await criar(mei, "Troca de fiação");
    expect(c).toMatchObject({ mei_id: mei, titulo: "Troca de fiação", origem: "chat" });

    const usuario = { role: "user", content: "oi" };
    const assistente = {
      role: "assistant",
      content: [
        { type: "text", text: "Olá" },
        { type: "parte-desconhecida", dado: { a: [1, 2, { b: null }] } },
      ],
      providerOptions: { qualquer: { coisa: true } },
    };
    await anexar(mei, c.id, "user", usuario);
    const l = await anexar(mei, c.id, "assistant", assistente, [{ tipo: "orcamento", id: "x" }]);
    expect(l.cartoes).toEqual([{ tipo: "orcamento", id: "x" }]);

    const linhas = await ler(mei, c.id);
    expect(linhas.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(linhas[0].content).toEqual(usuario);
    expect(linhas[1].content).toEqual(assistente);
    expect(linhas[0].cartoes).toBeNull();
  });

  it("título em branco vira 'Nova conversa' e título longo é cortado", async () => {
    const mei = await criarMei(b);
    expect((await criar(mei, "   ")).titulo).toBe("Nova conversa");
    expect((await criar(mei, "a".repeat(200))).titulo).toHaveLength(80);
  });

  it("origem inválida e role inválida viram regra", async () => {
    const mei = await criarMei(b);
    await expect(criar(mei, "x", "whatsapp")).rejects.toThrow(regra());
    const c = await criar(mei);
    await expect(anexar(mei, c.id, "robo", { role: "robo" })).rejects.toThrow(regra());
  });

  it("conversa de outro MEI se comporta como inexistente", async () => {
    const a = await criarMei(b, "A");
    const outro = await criarMei(b, "B");
    const c = await criar(a);
    await anexar(a, c.id, "user", { role: "user", content: "oi" });
    await expect(anexar(outro, c.id, "user", { role: "user", content: "x" })).rejects.toThrow(
      regra("conversa não encontrada"),
    );
    await expect(ler(outro, c.id)).rejects.toThrow(regra("conversa não encontrada"));
    expect(await listar(outro)).toEqual([]);
  });

  it("anexar várias grava todas de uma vez, ou nenhuma", async () => {
    const mei = await criarMei(b);
    const c = await criar(mei);
    const linhas = await anexarVarias(mei, c.id, [
      { role: "assistant", content: { role: "assistant", content: [] } },
      { role: "tool", content: { role: "tool", content: [] }, cartoes: [{ tipo: "mensagem", id: "m" }] },
    ]);
    expect(linhas.map((l) => l.role)).toEqual(["assistant", "tool"]);
    expect(linhas[1].cartoes).toEqual([{ tipo: "mensagem", id: "m" }]);

    // A 2ª é inválida: a 1ª também não fica.
    await expect(
      anexarVarias(mei, c.id, [
        { role: "assistant", content: { role: "assistant", content: [] } },
        { role: "robo", content: {} },
      ]),
    ).rejects.toThrow(regra());
    expect(await ler(mei, c.id)).toHaveLength(2);
  });

  it("lista as conversas do MEI, a de mensagem mais recente primeiro", async () => {
    const mei = await criarMei(b);
    const velha = await criar(mei, "Velha");
    const nova = await criar(mei, "Nova");
    await anexar(mei, nova.id, "user", { role: "user", content: "1" });
    await anexar(mei, velha.id, "user", { role: "user", content: "2" });
    expect((await listar(mei)).map((c) => c.titulo)).toEqual(["Velha", "Nova"]);
  });
});

describe("agente_acoes", () => {
  it("acao_registrar grava a chamada de ferramenta", async () => {
    const mei = await criarMei(b);
    const c = await criar(mei);
    const a = (await b.rpc("acao_registrar", {
      p_mei: mei,
      p_conversa: c.id,
      p_tipo: "ferramenta",
      p_nome: "buscar_cliente",
      p_entrada: { termo: "Maria" },
      p_saida: { conteudo: "[]" },
      p_erro: false,
    })) as Acao;
    expect(a).toMatchObject({
      mei_id: mei,
      conversa_id: c.id,
      tipo: "ferramenta",
      nome: "buscar_cliente",
      entrada: { termo: "Maria" },
      erro: false,
      user_id: null,
    });
  });

  it("acao_registrar com conversa de outro MEI vira regra", async () => {
    const a = await criarMei(b, "A");
    const outro = await criarMei(b, "B");
    const c = await criar(a);
    await expect(
      b.rpc("acao_registrar", {
        p_mei: outro,
        p_conversa: c.id,
        p_tipo: "ferramenta",
        p_nome: "x",
        p_entrada: {},
        p_saida: {},
        p_erro: false,
      }),
    ).rejects.toThrow(regra("conversa não encontrada"));
  });

  it("item_decidir grava uma ação 'decisao' só quando muda o item", async () => {
    const mei = await criarMei(b);
    const user = await dono(mei);
    const msg = (await b.rpc("mensagem_rascunhar", {
      p_mei: mei,
      p_dados: { canal: "instagram", objetivo: "post", conteudo: "Promoção de limpeza de ar" },
    })) as { id: string };

    const decidir = (decisao: string) =>
      b.rpc("item_decidir", { p_mei: mei, p_tipo: "mensagem", p_id: msg.id, p_decisao: decisao, p_user: user });
    await decidir("aprovar");
    await decidir("aprovar"); // clique duplo: não muda nada
    await decidir("descartar"); // depois de aprovado: não muda nada

    const acoes = (await b.q(`select * from public.agente_acoes where mei_id = $1`, [mei])) as Acao[];
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({
      tipo: "decisao",
      nome: "aprovar",
      conversa_id: null,
      user_id: user,
      erro: false,
      entrada: { tipo: "mensagem", id: msg.id, decisao: "aprovar" },
      saida: { tipo: "mensagem", id: msg.id, status: "aprovado", mudou: true },
    });
  });
});

describe("uso do agente", () => {
  it("uso_somar acumula no dia e uso_hoje devolve entrada + saída", async () => {
    const mei = await criarMei(b);
    const outro = await criarMei(b, "B");
    expect(await b.rpc("uso_hoje", { p_mei: mei })).toBe(0);

    await b.rpc("uso_somar", { p_mei: mei, p_entrada: 100, p_saida: 20 });
    const u = (await b.rpc("uso_somar", { p_mei: mei, p_entrada: 50, p_saida: 5 })) as {
      tokens_entrada: number;
      tokens_saida: number;
      dia: string;
    };
    expect(u).toMatchObject({ tokens_entrada: 150, tokens_saida: 25 });
    expect(await b.rpc("uso_hoje", { p_mei: mei })).toBe(175);
    expect(await b.rpc("uso_hoje", { p_mei: outro })).toBe(0);
  });

  it("uso de ontem não conta para hoje", async () => {
    const mei = await criarMei(b);
    await b.q(
      `insert into public.agente_uso (mei_id, dia, tokens_entrada, tokens_saida)
       values ($1, public.hoje_sp() - 1, 999999, 1)`,
      [mei],
    );
    expect(await b.rpc("uso_hoje", { p_mei: mei })).toBe(0);
  });

  it("uso negativo vira zero", async () => {
    const mei = await criarMei(b);
    await b.rpc("uso_somar", { p_mei: mei, p_entrada: -10, p_saida: null });
    expect(await b.rpc("uso_hoje", { p_mei: mei })).toBe(0);
  });
});

describe("memórias", () => {
  const salvar = (mei: string, fato: string) =>
    b.rpc("memoria_salvar", { p_mei: mei, p_fato: fato }) as Promise<{ id: string; fato: string }>;
  const listarMem = (mei: string) =>
    b.rpc("memoria_listar", { p_mei: mei }) as Promise<{ id: string; fato: string }[]>;

  it("salva, apara e não duplica o mesmo fato", async () => {
    const mei = await criarMei(b);
    const a = await salvar(mei, "  Cobra 50% de entrada.  ");
    expect(a.fato).toBe("Cobra 50% de entrada.");
    const de_novo = await salvar(mei, "cobra 50% de entrada.");
    expect(de_novo.id).toBe(a.id);
    expect(await listarMem(mei)).toHaveLength(1);
  });

  it("fato vazio ou longo demais vira regra", async () => {
    const mei = await criarMei(b);
    await expect(salvar(mei, "  ")).rejects.toThrow(regra());
    await expect(salvar(mei, "x".repeat(501))).rejects.toThrow(regra());
  });

  it("lista no máximo 30, as mais novas primeiro, só do MEI", async () => {
    const mei = await criarMei(b);
    const outro = await criarMei(b, "B");
    for (let i = 1; i <= 32; i++) await salvar(mei, `fato ${i}`);
    await salvar(outro, "do outro");
    const l = await listarMem(mei);
    expect(l).toHaveLength(30);
    expect(l[0].fato).toBe("fato 32");
    expect(l.at(-1)!.fato).toBe("fato 3");
    expect(l.some((m) => m.fato === "do outro")).toBe(false);
  });
});
