import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConhecimentoAchado, Mei, PropostaPendente } from "@/lib/dominio/tipos";
import { AVISO_MINUTA } from "@/lib/documentos/contrato";
import { abrirBancoTeste, type BancoTeste } from "../helpers/banco";

const SEED = fileURLToPath(new URL("../../supabase/seed/demo-completo.sql", import.meta.url));
const EMAIL = "demo-completo@teste.local";

let b: BancoTeste;
let mei: Mei;
const contagens: Record<string, number> = {};

const TABELAS = ["clientes", "servicos", "agendamentos", "pagamentos", "orcamentos", "contratos", "mensagens", "tarefas", "memorias", "conhecimento"];

async function contar(tabela: string): Promise<number> {
  return (await b.q(`select count(*)::int as n from public.${tabela} where mei_id = $1`, [mei.id]))[0].n;
}

async function distintos(sql: string): Promise<string[]> {
  return (await b.q(sql, [mei.id])).map((r) => r.v).sort();
}

// O seed roda uma vez (e de novo, para provar que é idempotente); os testes só leem.
beforeAll(async () => {
  b = await abrirBancoTeste();
  const [usuario] = await b.q(
    "insert into public.users (email, name, password_hash) values ($1, 'Demo', 'teste') returning id",
    [EMAIL],
  );
  const sql = (await readFile(SEED, "utf8")).replaceAll("<EMAIL_DO_USUARIO>", EMAIL);
  await b.pg.exec(sql);
  mei = (await b.rpc("mei_do_usuario", { p_user: usuario.id })) as Mei;
  for (const t of TABELAS) contagens[t] = await contar(t);
  await b.pg.exec(sql);
}, 60_000);

afterAll(async () => {
  await b?.fechar();
});

describe("seed completo de demonstração", () => {
  it("rodar de novo não duplica nada", async () => {
    for (const t of TABELAS) expect(await contar(t), t).toBe(contagens[t]);
  });

  it("cria o MEI fictício com dados do negócio", () => {
    expect(mei).toMatchObject({ nome: "Lima Reparos e Climatização", cidade: "Goiânia" });
    expect(mei.chave_pix).toBeTruthy();
  });

  it("tem de 15 a 25 clientes, todos com telefone da faixa fictícia e com algum serviço", async () => {
    expect(contagens.clientes).toBeGreaterThanOrEqual(15);
    expect(contagens.clientes).toBeLessThanOrEqual(25);
    const fora = await b.q(
      "select nome, whatsapp from public.clientes where mei_id = $1 and whatsapp !~ '^629000000[0-9]{2}$'",
      [mei.id],
    );
    expect(fora).toEqual([]);
    const semServico = await b.q(
      `select c.nome from public.clientes c
       where c.mei_id = $1 and not exists (select 1 from public.servicos s where s.cliente_id = c.id)`,
      [mei.id],
    );
    expect(semServico).toEqual([]);
  });

  it("tem serviço em todos os status", async () => {
    expect(await distintos("select distinct status as v from public.servicos where mei_id = $1")).toEqual(
      ["agendado", "aguardando_resposta", "cancelado", "confirmado", "executado", "orcado", "pago", "rascunho"],
    );
    expect(contagens.servicos).toBeGreaterThanOrEqual(25);
  });

  it("tem agenda no passado e no futuro, com algo para hoje ou amanhã", async () => {
    const [a] = await b.q(
      `select count(*) filter (where inicio < now())::int as passado,
              count(*) filter (where inicio > now())::int as futuro,
              count(*) filter (where (inicio at time zone 'America/Sao_Paulo')::date between public.hoje_sp() and public.hoje_sp() + 1)::int as proximo
       from public.agendamentos where mei_id = $1`,
      [mei.id],
    );
    expect(a.passado).toBeGreaterThanOrEqual(3);
    expect(a.futuro).toBeGreaterThanOrEqual(3);
    expect(a.proximo).toBeGreaterThanOrEqual(1);
  });

  it("tem pagamento integral e parcial, em mais de uma forma", async () => {
    const parciais = await b.q(
      `select s.numero from public.servicos s
       join public.pagamentos p on p.servico_id = s.id
       where s.mei_id = $1 and s.status = 'executado'
       group by s.id, s.numero, s.valor having sum(p.valor) < s.valor`,
      [mei.id],
    );
    expect(parciais.length).toBeGreaterThanOrEqual(1);
    expect((await distintos("select distinct forma as v from public.pagamentos where mei_id = $1")).length).toBeGreaterThanOrEqual(3);
  });

  it("tem orçamento e contrato em rascunho, aprovado e descartado; minuta sempre com o aviso", async () => {
    const tres = ["aprovado", "descartado", "rascunho"];
    expect(await distintos("select distinct status as v from public.orcamentos where mei_id = $1")).toEqual(tres);
    expect(await distintos("select distinct status as v from public.contratos where mei_id = $1")).toEqual(tres);
    const minutas = await b.q("select minuta from public.contratos where mei_id = $1", [mei.id]);
    for (const m of minutas) expect(m.minuta.startsWith(AVISO_MINUTA)).toBe(true);
  });

  it("tem mensagem em todos os status e um post de Instagram", async () => {
    expect(await distintos("select distinct status as v from public.mensagens where mei_id = $1")).toEqual(
      ["aprovado", "descartado", "enviado", "rascunho"],
    );
    const posts = await b.q("select 1 from public.mensagens where mei_id = $1 and canal = 'instagram' and objetivo = 'post'", [mei.id]);
    expect(posts.length).toBeGreaterThanOrEqual(1);
  });

  it("tem propostas paradas, com tarefa aberta, feita e ignorada, e uma para o agendador lembrar", async () => {
    const propostas = (await b.rpc("propostas_pendentes", { p_mei: mei.id })) as PropostaPendente[];
    expect(propostas.length).toBeGreaterThanOrEqual(3);
    expect(await distintos("select distinct status as v from public.tarefas where mei_id = $1")).toEqual(
      ["aberta", "feita", "ignorada"],
    );
    const semLembrete = (await b.rpc("followups_sem_lembrete", { p_mei: mei.id })) as unknown[];
    expect(semLembrete.length).toBeGreaterThanOrEqual(1);
  });

  it("tem memórias do negócio", () => {
    expect(contagens.memorias).toBeGreaterThanOrEqual(5);
  });

  it("tem conhecimento de todos os tipos, e a busca responde", async () => {
    expect(contagens.conhecimento).toBeGreaterThanOrEqual(30);
    expect(await distintos("select distinct tipo as v from public.conhecimento where mei_id = $1")).toEqual(
      ["atendimento", "faq", "nota_cliente", "politica", "preco"],
    );
    const [garantia] = (await b.rpc("conhecimento_buscar", { p_mei: mei.id, p_termo: "qual a garantia?" })) as ConhecimentoAchado[];
    expect(garantia.tipo).toBe("politica");
    const [preco] = (await b.rpc("conhecimento_buscar", {
      p_mei: mei.id,
      p_termo: "quanto custa instalar ar condicionado",
      p_tipo: "preco",
    })) as ConhecimentoAchado[];
    expect(preco.conteudo).toMatch(/R\$/);
  });

  it("todo cliente com nota tem a nota achada pelo nome dele", async () => {
    const notas = await b.q(
      `select distinct c.id, c.nome from public.conhecimento k join public.clientes c on c.id = k.cliente_id
       where k.mei_id = $1 and k.tipo = 'nota_cliente'`,
      [mei.id],
    );
    expect(notas.length).toBeGreaterThanOrEqual(10);
    for (const c of notas) {
      const achados = (await b.rpc("conhecimento_buscar", {
        p_mei: mei.id,
        p_termo: c.nome,
        p_cliente: c.id,
      })) as ConhecimentoAchado[];
      expect(achados.length, c.nome).toBeGreaterThanOrEqual(1);
    }
  });
});
