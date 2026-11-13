import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Wordmark from "@/app/components/Wordmark";

const html = (className?: string) => renderToStaticMarkup(createElement(Wordmark, { className }));

describe("Wordmark", () => {
  it("é a logo em SVG, com nome acessível", () => {
    const h = html();
    expect(h).toMatch(/^<svg/);
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="MEIagente"');
    expect(h).toContain('viewBox="0 0 963 179"');
  });

  it("tem as três camadas da logo: texto, selo e letras do selo", () => {
    const h = html();
    expect(h.match(/<path /g)).toHaveLength(3);
    expect(h).toContain("wordmark__texto");
    expect(h).toContain("wordmark__selo");
    expect(h).toContain("wordmark__selo-letras");
  });

  it("repassa a classe de tamanho e de variante", () => {
    expect(html("wordmark--on-brand text-[1.35rem]")).toContain('class="wordmark wordmark--on-brand text-[1.35rem]"');
  });
});
