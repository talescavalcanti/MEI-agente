import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  Cliente,
  FollowupGerado,
  Mensagem,
  Orcamento,
  PropostaPendente,
  Servico,
  Tarefa,
} from "@/lib/dominio/tipos";
import { abrirBancoTeste, carregarSql, criarMei, type BancoTeste } from "../helpers/banco";

let b: BancoTeste;

// Abrir o PGlite com todo o SQL passa dos 10s padrão do hook quando a suíte
// inteira roda em paralelo.
beforeEach(async () => {
  b = await abrirBancoTeste();
}, 30_000);

afterEach(async () => {
  await b.fechar();
});

const regra = (frase?: string) => (frase ? `regra: ${frase}` : /^regra: /);

const pendentes = (mei: string, dias?: number) =>
  b.rpc("propostas_pendentes", { p_mei: mei, p_dias: dias }) as Promise<PropostaPendente[]>;
const gerarFollowups = (dias?: number) =>
  b.rpc("tarefas_gerar_followups", { p_dias: dias }) as Promise<FollowupGerado[]>;
const fechar = (mei: string, id: string, status: string) =>
  b.rpc("tarefa_fechar", { p_mei: mei, p_id: id, p_status: status }) as Promise<Tarefa>;
const rascunhar = (mei: string, dados: Record<string, unknown>) =>
  b.rpc("mensagem_rascunhar", { p_mei: mei, p_dados: dados }) as Promise<Mensagem>;
const enviada = (mei: string, id: string) =>
  b.rpc("mensagem_marcar_enviada", { p_mei: mei, p_id: id }) as Promise<Mensagem>;
const aprovar = (mei: string, tipo: string, id: string) =>
  b.rpc("item_decidir", { p_mei: mei, p_tipo: tipo, p_id: id, p_decisao: "aprovar", p_user: null });
const tarefas = async (servicoId: string) =>
  (await b.q(`select * from public.tarefas where servico_id = $1 order by criado_em`, [servicoId])) as Tarefa[];

/** Recua o envio do orçamento do serviço em `dias` (simula proposta parada). */
const recuarEnvio = (servicoId: string, dias: number) =>
  b.q(`update public.orcamentos set enviado_em = now() - make_interval(days => $2) where servico_id = $1`, [
    servicoId,
    dias,
  ]);

/**
 * MEI com cliente e serviço de R$ 800 com orçamento enviado pelas funções de
 * verdade (gerar, rascunhar, aprovar, marcar enviada): serviço em
 * `aguardando_resposta`. Depois recua o envio em `dias`.
 */
async function propostaEnviada(dias: number, mei?: string) {
  mei ??= await criarMei(b, "Refrigeração do Zé");
  const c = (await b.rpc("cliente_salvar", {
    p_mei: mei,
    p_dados: { nome: "Maria Souza", whatsapp: "62 9 9999-0000" },
  })) as Cliente;
  const s = (await b.rpc("servico_registrar", {
    p_mei: mei,
    p_dados: { cliente_id: c.id, descricao: "Instalação de ar-condicionado", valor: 800 },
  })) as Servico;
  const o = (await b.rpc("orcamento_gerar", { p_mei: mei, p_servico: s.id })) as Orcamento;
  await aprovar(mei, "orcamento", o.id);
  const m = await rascunhar(mei, {
    canal: "whatsapp",
    objetivo: "envio_orcamento",
    servico_id: s.id,
    conteudo: "Oi Maria, segue o orçamento.",
  });
  await aprovar(mei, "mensagem", m.id);
  await enviada(mei, m.id);
  await recuarEnvio(s.id, dias);
  return { mei, c, s };
}

describe("schema", () => {
  it("o SQL é idempotente (rodar de novo não quebra)", async () => {
    await carregarSql(b.pg);
  });
});

describe("propostas_pendentes", () => {
  it("orçamento enviado há 4 dias aparece com dias_parado = 4", async () => {
    const { mei, c, s } = await propostaEnviada(4);
    const lista = await pendentes(mei);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      servico_id: s.id,
      numero: s.numero,
      descricao: "Instalação de ar-condicionado",
      valor: 800,
      cliente_id: c.id,
      cliente_nome: "Maria Souza",
      dias_parado: 4,
      tarefa_id: null,
    });
    expect(lista[0].cliente_whatsapp).toBeTruthy();
    expect(lista[0].enviado_em).toBeTruthy();
  });

  it("orçamento enviado há 1 dia não aparece (padrão 3 dias), mas aparece com p_dias = 1", async () => {
    const { mei } = await propostaEnviada(1);
    expect(await pendentes(mei)).toEqual([]);
    expect(await pendentes(mei, 1)).toHaveLength(1);
  });

  it("serviço confirmado não aparece", async () => {
    const { mei, s } = await propostaEnviada(5);
    await b.rpc("servico_mudar_status", { p_mei: mei, p_id: s.id, p_para: "confirmado" });
    expect(await pendentes(mei)).toEqual([]);
  });

  it("não mostra proposta de outro MEI", async () => {
    await propostaEnviada(5);
    const outro = await criarMei(b, "Outro MEI");
    expect(await pendentes(outro)).toEqual([]);
  });

  it("p_dias negativo → regra", async () => {
    const { mei } = await propostaEnviada(5);
    await expect(pendentes(mei, -1)).rejects.toThrow(regra());
  });
});

describe("tarefas_gerar_followups", () => {
  it("rodado duas vezes cria 1 tarefa aberta, vencendo hoje", async () => {
    const { mei, s } = await propostaEnviada(4);
    const primeira = await gerarFollowups();
    expect(primeira).toHaveLength(1);
    expect(primeira[0]).toMatchObject({ mei_id: mei, servico_id: s.id });
    expect(await gerarFollowups()).toEqual([]);

    const [t] = await tarefas(s.id);
    expect(await tarefas(s.id)).toHaveLength(1);
    const [{ hoje }] = await b.q(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as hoje`);
    expect(t).toMatchObject({ id: primeira[0].tarefa_id, tipo: "follow_up_orcamento", status: "aberta" });
    expect(String((await b.q(`select vencimento::text as v from public.tarefas where id = $1`, [t.id]))[0].v)).toBe(hoje);

    const [p] = await pendentes(mei);
    expect(p.tarefa_id).toBe(t.id);
  });

  it("cobre todos os MEIs e ignora proposta recente", async () => {
    const a = await propostaEnviada(4);
    const outro = await propostaEnviada(6, await criarMei(b, "Outro MEI"));
    await propostaEnviada(1, a.mei);
    const novas = await gerarFollowups();
    expect(novas.map((n) => n.servico_id).sort()).toEqual([a.s.id, outro.s.id].sort());
  });

  it("tarefa ignorada não é recriada no mesmo dia, mas o serviço continua pendente", async () => {
    const { mei, s } = await propostaEnviada(4);
    const [n] = await gerarFollowups();
    const t = await fechar(mei, n.tarefa_id, "ignorada");
    expect(t.status).toBe("ignorada");

    expect(await gerarFollowups()).toEqual([]);
    const lista = await pendentes(mei);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ servico_id: s.id, tarefa_id: null });

    // No dia seguinte, volta a gerar.
    await b.q(`update public.tarefas set criado_em = criado_em - interval '1 day' where id = $1`, [n.tarefa_id]);
    expect(await gerarFollowups()).toHaveLength(1);
  });
});

describe("tarefa_fechar", () => {
  it("marca feita; repetir não muda", async () => {
    const { mei } = await propostaEnviada(4);
    const [n] = await gerarFollowups();
    expect((await fechar(mei, n.tarefa_id, "feita")).status).toBe("feita");
    expect((await fechar(mei, n.tarefa_id, "ignorada")).status).toBe("feita");
  });

  it("id de outro MEI → regra: tarefa não encontrada", async () => {
    await propostaEnviada(4);
    const [n] = await gerarFollowups();
    const outro = await criarMei(b, "Outro MEI");
    await expect(fechar(outro, n.tarefa_id, "feita")).rejects.toThrow(regra("tarefa não encontrada"));
    await expect(fechar(outro, "nao-e-uuid", "feita")).rejects.toThrow(regra("tarefa não encontrada"));
  });

  it("status inválido → regra", async () => {
    const { mei } = await propostaEnviada(4);
    const [n] = await gerarFollowups();
    await expect(fechar(mei, n.tarefa_id, "aberta")).rejects.toThrow(regra());
    await expect(fechar(mei, n.tarefa_id, "qualquer")).rejects.toThrow(regra());
  });
});

describe("mensagem com tarefa", () => {
  it("marcar enviada a mensagem de follow-up fecha a tarefa (aberta → feita)", async () => {
    const { mei, s } = await propostaEnviada(4);
    const [n] = await gerarFollowups();
    const m = await rascunhar(mei, {
      canal: "whatsapp",
      objetivo: "lembrete",
      servico_id: s.id,
      tarefa_id: n.tarefa_id,
      conteudo: "Oi Maria, conseguiu ver o orçamento?",
    });
    await aprovar(mei, "mensagem", m.id);
    await enviada(mei, m.id);
    const [t] = await tarefas(s.id);
    expect(t.status).toBe("feita");
    expect(await gerarFollowups()).toEqual([]);
  });

  it("tarefa inexistente ou de outro MEI → regra: tarefa não encontrada", async () => {
    const { mei, s } = await propostaEnviada(4);
    const outro = await propostaEnviada(4, await criarMei(b, "Outro MEI"));
    const novas = await gerarFollowups();
    const doOutro = novas.find((x) => x.mei_id === outro.mei)!;
    const base = { canal: "whatsapp", objetivo: "lembrete", servico_id: s.id, conteudo: "Oi" };
    await expect(rascunhar(mei, { ...base, tarefa_id: doOutro.tarefa_id })).rejects.toThrow(
      regra("tarefa não encontrada"),
    );
    await expect(
      rascunhar(mei, { ...base, tarefa_id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(regra("tarefa não encontrada"));
  });

  it("apagar a tarefa deixa a mensagem com tarefa_id nulo (FK on delete set null)", async () => {
    const { mei, s } = await propostaEnviada(4);
    const [n] = await gerarFollowups();
    const m = await rascunhar(mei, {
      canal: "whatsapp",
      objetivo: "lembrete",
      servico_id: s.id,
      tarefa_id: n.tarefa_id,
      conteudo: "Oi",
    });
    await b.q(`delete from public.tarefas where id = $1`, [n.tarefa_id]);
    const [linha] = await b.q(`select tarefa_id from public.mensagens where id = $1`, [m.id]);
    expect(linha.tarefa_id).toBeNull();
  });
});
