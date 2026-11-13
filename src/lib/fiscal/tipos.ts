// Tipos do módulo fiscal em TypeScript puro (documento, XML da NFS-e, códigos).

/** Campos conferidos de uma NFS-e emitida, extraídos do XML (`lerNfse`). */
export type NfseLida = {
  /** Número da NFS-e (`nNFSe`). */
  numero_nfse: string;
  /** Chave de acesso: os 50 dígitos do `Id` da `infNFSe`, sem o "NFS". */
  chave_acesso: string | null;
  /** Valor do serviço (`vServ`), em reais. */
  valor: number;
  /** CPF ou CNPJ do tomador, normalizado: maiúsculas, sem pontuação (o CNPJ pode ser alfanumérico). */
  tomador_documento: string;
  /** Competência (`dCompet`), `AAAA-MM-DD`. */
  competencia: string;
  /** Código de tributação nacional (`cTribNac`), 6 dígitos. */
  codigo_tributacao: string | null;
};

export type ErroLeituraNfse = { erro: string };

/** Linha de sugestão de códigos fiscais por atividade. */
export type CodigoSugerido = {
  atividade: string;
  /** cTribNac, 6 dígitos, conferido no Anexo B oficial. */
  codigo_tributacao: string;
  /** NBS, 9 dígitos, existente na aba de NBS do Anexo B; null se não houver um claro. */
  nbs: string | null;
  /**
   * false quando o NBS foi escolhido pela descrição (o Anexo B não liga
   * cTribNac a NBS): o cartão mostra "confira o NBS".
   */
  nbs_conferido: boolean;
  descricao: string;
};
