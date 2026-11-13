import { describe, expect, it } from "vitest";
import { acaoDaTecla, falarTempo, formatarTempo } from "@/app/lp/video";

describe("player da demonstração na landing", () => {
  it("formata o tempo em m:ss", () => {
    expect(formatarTempo(0)).toBe("0:00");
    expect(formatarTempo(9.7)).toBe("0:09");
    expect(formatarTempo(65)).toBe("1:05");
    expect(formatarTempo(338.6)).toBe("5:38");
  });

  it("passa a h:mm:ss a partir de uma hora", () => {
    expect(formatarTempo(3725)).toBe("1:02:05");
  });

  it("trata tempo inválido como zero", () => {
    expect(formatarTempo(Number.NaN)).toBe("0:00");
    expect(formatarTempo(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatarTempo(-3)).toBe("0:00");
  });

  it("descreve o tempo por extenso para leitor de tela", () => {
    expect(falarTempo(338.6)).toBe("5 min 38 s");
    expect(falarTempo(60)).toBe("1 min");
    expect(falarTempo(42)).toBe("42 s");
    expect(falarTempo(0)).toBe("0 s");
  });

  it("liga as teclas de atalho às ações do player", () => {
    expect(acaoDaTecla(" ")).toBe("alternar");
    expect(acaoDaTecla("k")).toBe("alternar");
    expect(acaoDaTecla("K")).toBe("alternar");
    expect(acaoDaTecla("ArrowLeft")).toBe("voltar");
    expect(acaoDaTecla("j")).toBe("voltar");
    expect(acaoDaTecla("ArrowRight")).toBe("avancar");
    expect(acaoDaTecla("l")).toBe("avancar");
    expect(acaoDaTecla("m")).toBe("mudo");
    expect(acaoDaTecla("f")).toBe("telaCheia");
    expect(acaoDaTecla("Enter")).toBeNull();
    expect(acaoDaTecla("a")).toBeNull();
  });
});
