// Minuta de contrato de prestação de serviço, por template a partir do banco.
// Valores e datas nunca vêm do texto do modelo; dado ausente vira
// [A PREENCHER], e o aviso obrigatório (README §9) é sempre a primeira linha.
import { A_PREENCHER, dataExtensoOu, moedaOu, telefoneOu, texto } from "./formato";
import { valorTotal } from "./orcamento";
import type { DadosDocumento } from "./tipos";

export const AVISO_MINUTA =
  "Minuta gerada automaticamente. Revise antes de usar; não substitui orientação jurídica.";

const ou = (v: string | null | undefined) => texto(v) ?? A_PREENCHER;

export function renderMinuta(d: DadosDocumento, clausulasExtras: string[] = []): string {
  const { mei, cliente, servico } = d;
  const cidade = ou(mei.cidade);

  const forma = texto(servico.forma_pagamento);
  const chave = texto(mei.chave_pix);
  const pagamento =
    forma === null ? A_PREENCHER : chave && /\bpix\b/i.test(forma) ? `${forma}, chave ${chave}` : forma;

  const fixas: [string, string][] = [
    [
      "DO OBJETO",
      `O CONTRATADO prestará ao CONTRATANTE o serviço de ${ou(servico.descricao)}, ` +
        `no seguinte local: ${ou(servico.local)}.`,
    ],
    [
      "DO PREÇO E DO PAGAMENTO",
      `Pelo serviço, o CONTRATANTE pagará ao CONTRATADO o valor total de ${moedaOu(valorTotal(d))}, ` +
        `na seguinte forma de pagamento: ${pagamento}.`,
    ],
    [
      "DO PRAZO",
      `O serviço será executado em ${dataExtensoOu(servico.data_prevista)}. ` +
        "Mudança de data deve ser combinada entre as partes com antecedência.",
    ],
    [
      "DAS OBRIGAÇÕES",
      "O CONTRATADO se obriga a executar o serviço com zelo e boa técnica, e a avisar o CONTRATANTE " +
        "de qualquer imprevisto. O CONTRATANTE se obriga a pagar o valor combinado na forma acima e a " +
        "garantir o acesso ao local na data marcada.",
    ],
    [
      "DA RESCISÃO",
      "Qualquer das partes pode desistir deste contrato com aviso prévio à outra. O que já tiver " +
        "sido executado até o aviso será pago na proporção do serviço feito.",
    ],
    [
      "DO FORO",
      `Fica eleito o foro da comarca de ${cidade} para resolver qualquer questão sobre este contrato.`,
    ],
  ];

  const clausulas = [
    ...fixas.map(([titulo, corpo], i) => `CLÁUSULA ${i + 1}ª (${titulo}): ${corpo}`),
    ...clausulasExtras
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c, i) => `CLÁUSULA ${fixas.length + i + 1}ª: ${c}`),
  ];

  return [
    AVISO_MINUTA,
    "",
    "CONTRATO DE PRESTAÇÃO DE SERVIÇO",
    "",
    `CONTRATADO: ${ou(mei.nome)}, atividade de ${ou(mei.atividade)}, telefone ${telefoneOu(mei.telefone)}, ` +
      `com sede em ${cidade}.`,
    `CONTRATANTE: ${ou(cliente.nome)}, WhatsApp ${telefoneOu(cliente.whatsapp)}, ` +
      `residente em ${ou(cliente.endereco)}.`,
    "",
    "As partes acima combinam a prestação de serviço descrita nas cláusulas a seguir.",
    "",
    ...clausulas.flatMap((c) => [c, ""]),
    `${cidade}, ____ de ______________ de ________.`,
    "",
    "______________________________",
    `${ou(mei.nome)} (CONTRATADO)`,
    "",
    "______________________________",
    `${ou(cliente.nome)} (CONTRATANTE)`,
    "",
  ].join("\n");
}
