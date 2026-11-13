import { describe, expect, it } from "vitest";
import type { FaturamentoAno } from "@/lib/dominio/tipos";
import { textoFaixa } from "@/app/painel/notas/Termometro";

const base: FaturamentoAno = {
  ano: 2026,
  total: 30000,
  com_nota: 20000,
  sem_nota: 10000,
  limite: 81000,
  percentual: 37,
  projecao: 35000,
  faixa: "ok",
};

describe("textoFaixa", () => {
  it("ok: dentro do limite, sem falar em contador", () => {
    const t = textoFaixa(base, 0.2);
    expect(t.rotulo).toBe("Dentro do limite");
    expect(t.tom).toBe("ok");
    expect(t.texto).not.toMatch(/contador/);
  });

  it("projeção acima do limite avisa mesmo na faixa ok", () => {
    const t = textoFaixa({ ...base, projecao: 90000 }, 0.2);
    expect(t.texto).toContain("No ritmo atual, o ano fecha em R$ 90.000,00");
    expect(t.texto).toContain("acima do limite de R$ 81.000,00");
  });

  it("atencao e alerta", () => {
    expect(textoFaixa({ ...base, faixa: "atencao", percentual: 72 }, 0.2)).toMatchObject({ rotulo: "Atenção", tom: "atencao" });
    expect(textoFaixa({ ...base, faixa: "alerta", percentual: 93 }, 0.2)).toMatchObject({
      rotulo: "Perto do limite",
      tom: "alerta",
    });
  });

  it("excedido: até 20% acima, desenquadra no ano seguinte, com o teto calculado, e sugere contador", () => {
    const t = textoFaixa({ ...base, faixa: "excedido", total: 85000, percentual: 104.9 }, 0.2);
    expect(t).toMatchObject({ rotulo: "Limite ultrapassado", tom: "excedido" });
    expect(t.texto).toContain("até R$ 97.200,00");
    expect(t.texto).toContain("1º de janeiro do ano seguinte");
    expect(t.texto).toContain("contador");
  });

  it("excedido_grave: mais de 20% acima, desenquadramento retroativo e contador", () => {
    const t = textoFaixa({ ...base, faixa: "excedido_grave", total: 100000, percentual: 123.5 }, 0.2);
    expect(t).toMatchObject({ rotulo: "Muito acima do limite", tom: "excedido" });
    expect(t.texto).toContain("mais de R$ 97.200,00");
    expect(t.texto).toContain("retroativo");
    expect(t.texto).toContain("contador");
  });

  it("não usa travessão", () => {
    for (const faixa of ["ok", "atencao", "alerta", "excedido", "excedido_grave"] as const) {
      expect(textoFaixa({ ...base, faixa }, 0.2).texto).not.toMatch(/[—–]/);
    }
  });
});
