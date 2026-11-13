import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { abrirBancoTeste } from "../helpers/banco";

const SEED = fileURLToPath(new URL("../../supabase/seed/demo.sql", import.meta.url));

describe("seed de demonstração", () => {
  it("é idempotente e mostra o orçamento #009 de Carlos nas propostas pendentes", async () => {
    const b = await abrirBancoTeste();
    try {
      const [usuario] = await b.q(
        "insert into public.users (email, name, password_hash) values ($1, 'Demo', 'teste') returning id",
        ["demo@teste.local"],
      );
      const sql = (await readFile(SEED, "utf8")).replaceAll("<EMAIL_DO_USUARIO>", "demo@teste.local");

      await b.pg.exec(sql);
      await b.pg.exec(sql);

      const mei = (await b.rpc("mei_do_usuario", { p_user: usuario.id })) as { id: string; nome: string };
      expect(mei.nome).toBe("Refrigeração Bueno");
      expect((await b.q("select count(*)::int as n from public.clientes where mei_id = $1", [mei.id]))[0].n).toBe(5);
      expect((await b.q("select count(*)::int as n from public.servicos where mei_id = $1", [mei.id]))[0].n).toBe(3);
      expect((await b.q("select count(*)::int as n from public.pagamentos where mei_id = $1", [mei.id]))[0].n).toBe(1);
      const estados = await b.q("select descricao, status from public.servicos where mei_id = $1", [mei.id]);
      expect(estados).toEqual(expect.arrayContaining([
        { descricao: "Manutenção de ar-condicionado concluída", status: "pago" },
        { descricao: "Revisão de freezer agendada", status: "agendado" },
        { descricao: "Troca de fiação", status: "aguardando_resposta" },
      ]));
      const [agenda] = await b.q(
        "select (inicio at time zone 'America/Sao_Paulo')::date = public.hoje_sp() + 1 as amanha from public.agendamentos where mei_id = $1",
        [mei.id],
      );
      expect(agenda.amanha).toBe(true);
      const propostas = (await b.rpc("propostas_pendentes", { p_mei: mei.id })) as Array<Record<string, unknown>>;
      expect(propostas).toEqual(expect.arrayContaining([
        expect.objectContaining({ numero: 9, descricao: "Troca de fiação", valor: 450, cliente_nome: "Carlos Bueno", dias_parado: 4 }),
      ]));
    } finally {
      await b.fechar();
    }
  });
});
