import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  corStatus,
  diaSelecionado,
  diaValido,
  gradeMes,
  gradeSemana,
  horaSP,
  hrefMes,
  hrefSemana,
  intervalo,
  lerNavegacao,
  linkWhatsApp,
  somarMes,
  tituloDia,
  tituloMes,
  tituloSemana,
} from "@/app/painel/agenda/calendario";

const doMes = (mes: string) => gradeMes(mes).filter((d) => d.doMes);

describe("gradeMes", () => {
  it("mês que começa no domingo (novembro de 2026): a grade abre no dia 1º", () => {
    const g = gradeMes("2026-11");
    expect(g).toHaveLength(42);
    expect(g[0]).toMatchObject({ ymd: "2026-11-01", dia: 1, semana: 0, doMes: true, fimDeSemana: true });
    expect(g[41]).toMatchObject({ ymd: "2026-12-12", doMes: false, semana: 6 });
    expect(doMes("2026-11")).toHaveLength(30);
    expect(intervalo(g)).toEqual({ de: "2026-11-01", ate: "2026-12-12" });
  });

  it("mês que começa no sábado (agosto de 2026): 6 dias de julho antes do dia 1º", () => {
    const g = gradeMes("2026-08");
    expect(g[0]).toMatchObject({ ymd: "2026-07-26", doMes: false, semana: 0 });
    expect(g[6]).toMatchObject({ ymd: "2026-08-01", doMes: true, semana: 6, fimDeSemana: true });
    expect(g[41].ymd).toBe("2026-09-05");
    expect(doMes("2026-08")).toHaveLength(31);
  });

  it("fevereiro de 2028 (bissexto) tem o dia 29", () => {
    const g = gradeMes("2028-02");
    expect(g[0].ymd).toBe("2028-01-30");
    expect(doMes("2028-02")).toHaveLength(29);
    expect(g.find((d) => d.ymd === "2028-02-29")?.doMes).toBe(true);
    expect(g.find((d) => d.ymd === "2028-03-01")?.doMes).toBe(false);
  });

  it("sempre domingo a sábado, dias seguidos", () => {
    const g = gradeMes("2027-05");
    g.forEach((d, i) => expect(d.semana).toBe(i % 7));
  });
});

describe("virada de ano", () => {
  it("mês anterior e próximo atravessam o ano", () => {
    expect(somarMes("2026-12", 1)).toBe("2027-01");
    expect(somarMes("2027-01", -1)).toBe("2026-12");
    expect(somarMes("2026-11", 14)).toBe("2028-01");
  });

  it("janeiro de 2027 abre em dezembro de 2026", () => {
    const g = gradeMes("2027-01");
    expect(g[0]).toMatchObject({ ymd: "2026-12-27", doMes: false });
    expect(g[5]).toMatchObject({ ymd: "2027-01-01", doMes: true });
  });

  it("semana que atravessa o ano", () => {
    const s = gradeSemana("2026-12-30");
    expect(s.map((d) => d.ymd)).toEqual([
      "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
    ]);
    expect(s.every((d) => d.doMes)).toBe(true);
    expect(tituloSemana("2026-12-30")).toBe("27 de dezembro de 2026 a 2 de janeiro de 2027");
  });
});

describe("agruparPorDia (fuso de São Paulo)", () => {
  it("agendamento às 23h30 de SP fica no dia de SP, não no dia seguinte do UTC", () => {
    const tarde = { id: "a", inicio: "2026-11-21T02:30:00Z" }; // 20/11 23:30 em SP
    const cedo = { id: "b", inicio: "2026-11-20T11:00:00Z" }; // 20/11 08:00 em SP
    const outro = { id: "c", inicio: "2026-11-21T12:00:00Z" };
    const porDia = agruparPorDia([tarde, outro, cedo]);
    expect(porDia.get("2026-11-20")?.map((x) => x.id)).toEqual(["b", "a"]);
    expect(porDia.get("2026-11-21")?.map((x) => x.id)).toEqual(["c"]);
    expect(horaSP(tarde.inicio)).toBe("23:30");
    expect(horaSP(cedo.inicio)).toBe("08:00");
  });
});

describe("diaSelecionado", () => {
  const porDia = new Map([
    ["2026-12-10", [1]],
    ["2026-12-03", [1]],
    ["2027-01-02", [1]],
  ]);
  it("usa o ?dia quando é do mês", () => {
    expect(diaSelecionado("2026-12", "2026-12-15", "2026-11-13", porDia)).toBe("2026-12-15");
  });
  it("sem ?dia, hoje se for do mês", () => {
    expect(diaSelecionado("2026-11", null, "2026-11-13", porDia)).toBe("2026-11-13");
  });
  it("sem ?dia e fora do mês de hoje, o primeiro dia do mês com agendamento", () => {
    expect(diaSelecionado("2026-12", null, "2026-11-13", porDia)).toBe("2026-12-03");
    expect(diaSelecionado("2026-12", "2027-01-02", "2026-11-13", porDia)).toBe("2026-12-03");
  });
  it("sem nada, o dia 1º", () => {
    expect(diaSelecionado("2027-03", null, "2026-11-13", porDia)).toBe("2027-03-01");
  });
});

describe("navegação", () => {
  it("lê visão, mês e dia, ignorando valor inválido", () => {
    expect(lerNavegacao({}, "2026-11-13")).toEqual({ visao: "mes", mes: "2026-11", pedido: null });
    expect(lerNavegacao({ mes: "2027-02" }, "2026-11-13")).toEqual({ visao: "mes", mes: "2027-02", pedido: null });
    expect(lerNavegacao({ dia: "2027-03-04" }, "2026-11-13").mes).toBe("2027-03");
    expect(lerNavegacao({ mes: "2026-13", dia: "2026-02-31" }, "2026-11-13")).toEqual({
      visao: "mes",
      mes: "2026-11",
      pedido: null,
    });
    expect(lerNavegacao({ visao: "semana", dia: "2026-11-20" }, "2026-11-13").visao).toBe("semana");
  });

  it("diaValido recusa data que não existe", () => {
    expect(diaValido("2028-02-29")).toBe("2028-02-29");
    expect(diaValido("2027-02-29")).toBeNull();
    expect(diaValido("abc")).toBeNull();
  });

  it("monta as URLs", () => {
    expect(hrefMes("2026-11")).toBe("/painel/agenda?mes=2026-11");
    expect(hrefMes("2026-11", "2026-11-20")).toBe("/painel/agenda?mes=2026-11&dia=2026-11-20");
    expect(hrefSemana("2026-11-20")).toBe("/painel/agenda?visao=semana&dia=2026-11-20");
  });
});

describe("títulos e rótulos", () => {
  it("mês, semana e dia em português", () => {
    expect(tituloMes("2026-11")).toBe("novembro de 2026");
    expect(tituloSemana("2026-11-20")).toBe("15 a 21 de novembro de 2026");
    expect(tituloSemana("2026-12-01")).toBe("29 de novembro a 5 de dezembro de 2026");
    expect(tituloDia("2026-11-20")).toBe("sexta-feira, 20 de novembro");
  });

  it("cor por status, com 'Outro' para os demais", () => {
    expect(corStatus("pago").rotulo).toBe("Pago");
    expect(corStatus("aguardando_resposta").rotulo).toBe("Outro");
  });

  it("link do WhatsApp só com número válido", () => {
    expect(linkWhatsApp("62999990000")).toBe("https://wa.me/5562999990000");
    expect(linkWhatsApp("+55 (62) 99999-0000")).toBe("https://wa.me/5562999990000");
    expect(linkWhatsApp("1234")).toBeNull();
    expect(linkWhatsApp(null)).toBeNull();
  });
});
