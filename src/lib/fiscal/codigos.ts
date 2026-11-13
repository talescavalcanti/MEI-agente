// Códigos fiscais sugeridos por atividade, para o MEI preencher os dados
// fiscais em "Meu negócio". São só sugestões: o MEI confere e escolhe.
//
// Fonte (consultada em 13/11/2026): Anexo B da documentação técnica da
// NFS-e nacional, ANEXO_B-NBS2-LISTA_SERVICO_NACIONAL-SNNFSe-v1.01-20260122.xlsx,
// https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
//   - codigo_tributacao: aba LISTA.SERV.NAC. (cTribNac, 6 dígitos; a planilha
//     grava sem o zero à esquerda).
//   - nbs: aba LISTA.NBS_v2.0, sem os pontos (1.2001.81.00 = 120018100).
//     O Anexo B não liga cTribNac a NBS: o NBS de cada linha foi escolhido
//     pela descrição (todos existem na tabela oficial), por isso
//     `nbs_conferido: false`.
// Formato dos dois códigos e layout do XML: comentário no topo de `xml.ts`.
import type { CodigoSugerido } from "./tipos";

export const CODIGOS_SUGERIDOS: CodigoSugerido[] = [
  {
    atividade: "Eletricista",
    codigo_tributacao: "070202",
    nbs: "101061100",
    nbs_conferido: false,
    descricao:
      "Execução, por empreitada ou subempreitada, de obras de construção civil, hidráulica ou elétrica (LC 116, item 7.02). NBS: serviços de instalação de fiação elétrica e componentes.",
  },
  {
    atividade: "Técnico de manutenção",
    codigo_tributacao: "140101",
    nbs: "120018100",
    nbs_conferido: false,
    descricao:
      "Revisão, conserto, manutenção e conservação de máquinas, aparelhos e equipamentos (LC 116, item 14.01). NBS: manutenção e reparação de aparelhos eletroeletrônicos domésticos.",
  },
  {
    atividade: "Técnico de manutenção",
    codigo_tributacao: "140601",
    nbs: "101063200",
    nbs_conferido: false,
    descricao:
      "Instalação e montagem de aparelhos, máquinas e equipamentos, com material fornecido pelo cliente (LC 116, item 14.06). NBS: instalação de equipamentos de ventilação e ar-condicionado.",
  },
  {
    atividade: "Fotógrafo",
    codigo_tributacao: "130301",
    nbs: "114081300",
    nbs_conferido: false,
    descricao:
      "Fotografia e cinematografia, inclusive revelação, ampliação, cópia e reprodução (LC 116, item 13.03). NBS: serviços fotográficos e videográficos de eventos.",
  },
];

/** Palavras que também levam a cada atividade, além do próprio nome. */
const PALAVRAS: Record<string, string[]> = {
  Eletricista: ["eletric"],
  "Técnico de manutenção": ["manutencao", "refrigeracao", "ar condicionado", "climatizacao"],
  Fotógrafo: ["fotograf"],
};

/** Sem acento, minúsculo, hífen vira espaço, espaços juntos. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Linhas de `CODIGOS_SUGERIDOS` que combinam com a atividade do MEI, sem
 * acento e sem caixa. Atividade vazia devolve todas; sem par, lista vazia.
 */
export function sugerirCodigos(atividade: string | null): typeof CODIGOS_SUGERIDOS {
  const q = normalizar(atividade ?? "");
  if (!q) return CODIGOS_SUGERIDOS;
  return CODIGOS_SUGERIDOS.filter((c) => {
    const nome = normalizar(c.atividade);
    // `nome.includes(q)` só a partir de 3 letras: "e" não pode casar com tudo.
    if (q.includes(nome) || (q.length >= 3 && nome.includes(q))) return true;
    return (PALAVRAS[c.atividade] ?? []).some((p) => q.includes(normalizar(p)));
  });
}
