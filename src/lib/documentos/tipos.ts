// Entrada dos templates de documento. É o formato que o `item_ver` (Task 5)
// devolve; vem do banco, nunca do texto do modelo.

/** Todo campo pode ser `null`, menos `mei.nome` e `servico.descricao`. */
export type DadosDocumento = {
  mei: {
    nome: string;
    atividade: string | null;
    cidade: string | null;
    telefone: string | null;
    chave_pix: string | null;
  };
  cliente: {
    nome: string | null;
    whatsapp: string | null;
    endereco: string | null;
  };
  servico: {
    numero: number | null;
    descricao: string;
    valor: number | null;
    /** `AAAA-MM-DD` */
    data_prevista: string | null;
    local: string | null;
    forma_pagamento: string | null;
  };
  orcamento?: {
    numero: number | null;
    valor: number | null;
    itens: { descricao: string; valor: number }[];
    validade_dias: number | null;
  } | null;
};
