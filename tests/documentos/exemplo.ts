import type { DadosDocumento } from "@/lib/documentos/tipos";

/** O cenário do README: instalação de ar-condicionado fechada em R$ 800. */
export function dadosCompletos(): DadosDocumento {
  return {
    mei: {
      nome: "João Climatização",
      atividade: "Instalação e manutenção de ar-condicionado",
      cidade: "Goiânia",
      telefone: "62999990000",
      chave_pix: "joao@exemplo.com",
    },
    cliente: {
      nome: "Maria Souza",
      whatsapp: "5562988887777",
      endereco: "Rua 10, nº 200, Setor Bueno",
    },
    servico: {
      numero: 12,
      descricao: "Instalação de ar-condicionado split 12.000 BTUs",
      valor: 800,
      data_prevista: "2026-11-20",
      local: "Rua 10, nº 200, Setor Bueno",
      forma_pagamento: "Pix",
    },
    orcamento: {
      numero: 3,
      valor: 800,
      itens: [
        { descricao: "Mão de obra de instalação", valor: 650 },
        { descricao: "Suporte e tubulação", valor: 150 },
      ],
      validade_dias: 7,
    },
  };
}

/** Só o obrigatório: todo campo que pode ser null é null, e não há orçamento. */
export function dadosMinimos(): DadosDocumento {
  return {
    mei: { nome: "João Climatização", atividade: null, cidade: null, telefone: null, chave_pix: null },
    cliente: { nome: null, whatsapp: null, endereco: null },
    servico: {
      numero: null,
      descricao: "Instalação de ar-condicionado",
      valor: null,
      data_prevista: null,
      local: null,
      forma_pagamento: null,
    },
  };
}
