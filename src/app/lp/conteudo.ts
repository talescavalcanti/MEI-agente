/**
 * Texto da landing. Tudo sai do README (seções 1 a 4, 9 e Equipe): nada de
 * número, depoimento ou cliente inventado. Os exemplos de conversa são os do
 * README §3, marcados na página como ilustrativos.
 *
 * Regra do projeto: português do Brasil, sem travessão.
 */

export const NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#perguntas", label: "Perguntas" },
] as const;

/** README §1, "O que dizem as pesquisas do Sebrae (recorte MEI)". */
export const FONTES = [
  {
    id: 1,
    texto: "Sebrae, Pulso dos Pequenos Negócios, 13ª edição (nov/2026)",
    href: "https://agenciasebrae.com.br/?p=43963",
  },
  {
    id: 2,
    texto: "Sebrae, FGV IBRE e Google, coleta em set/2025 com cerca de 5.000 empresas (jan/2026)",
    href: "https://agenciasebrae.com.br/dados/pequenos-negocios-abracam-a-inteligencia-artificial-para-otimizar-o-tempo-e-inovar/",
  },
] as const;

export const NUMEROS = [
  { valor: 29, texto: "usam IA regularmente em marketing e comunicação.", fonte: 1 },
  { valor: 28, texto: "não usam, mas pretendem usar em breve.", fonte: 1 },
  { valor: 23, texto: "dizem que o maior obstáculo é não saber como aplicar IA no negócio.", fonte: 2 },
] as const;

/** README §3, tabela "Etapa / O que o agente faz". */
export const ETAPAS = [
  {
    title: "Interpreta",
    text: "Lê a frase e separa o que importa: o serviço, o valor e a data.",
  },
  {
    title: "Verifica",
    text: "Confere o que ainda falta para fechar: cliente, telefone, endereço, pagamento.",
  },
  {
    title: "Pergunta",
    text: "Pede só o que falta, em uma mensagem, do jeito que você conversaria.",
  },
  {
    title: "Prepara",
    text: "Monta orçamento, minuta de contrato, mensagem de confirmação e agendamento.",
  },
  {
    title: "Pede aprovação",
    text: "Cada item vira um cartão. Nada sai antes do seu clique.",
  },
] as const;

/** README §2, "Por que não usar o que já existe". */
export const COMPARACAO = {
  colunas: ["Assistente de IA genérico", "WhatsApp e planilha", "App de gestão", "MEIagente"],
  linhas: [
    ["Entende uma frase solta, como “fechei um serviço de R$ 800 para sexta”", "Sim", "Não", "Não", "Sim"],
    ["Conhece os clientes, preços e histórico do negócio", "Não", "Em parte, à mão", "Sim", "Sim"],
    ["Registra cliente, serviço, agenda e pagamento", "Não", "À mão", "Sim, por formulário", "Sim, a partir da conversa"],
    ["Gera orçamento e contrato com os dados do negócio", "Em parte, sem salvar", "Não", "Às vezes", "Sim"],
    ["Lembra sozinho das propostas paradas", "Não", "Não", "Raramente", "Sim"],
    ["Pede aprovação antes de qualquer ação externa", "Não se aplica", "Não se aplica", "Não se aplica", "Sim"],
    ["Exige conhecimento técnico ou configuração", "Saber escrever bons pedidos", "Não", "Aprender o sistema", "Não"],
  ],
} as const;

/**
 * README §9, reduzido ao que quem usa precisa saber. Os detalhes técnicos
 * (validação das ferramentas, teto de etapas e de custo) ficam no README.
 */
export const GARANTIAS = [
  "Tudo começa como rascunho.",
  "Você aprova, edita ou descarta.",
  "Cada passo fica registrado.",
] as const;

/** O histórico do exemplo do README §3, em português e sem nome de função. */
export const HISTORICO = [
  { autor: "Agente", acao: "Preparou o orçamento #012", estado: "rascunho" },
  { autor: "Agente", acao: "Escreveu a mensagem para a Maria", estado: "rascunho" },
  { autor: "Você", acao: "Aprovou o orçamento", estado: "aprovado" },
  { autor: "Você", acao: "Aprovou a mensagem", estado: "aprovado" },
] as const;

/** README, Equipe. */
export const EQUIPE = [
  {
    nome: "Tales Cavalcanti",
    papel: "Tech Lead · MEI",
    texto:
      "Arquitetura do produto e núcleo do agente: laço, ferramentas, prompt, cliente do modelo e base de conhecimento. Integração com a Meta, fundação do app e deploy.",
  },
  {
    nome: "Victor Julius",
    papel: "Backend e banco de dados",
    texto:
      "Regras de negócio no SQL: serviços, agenda, pagamentos e máquina de estados; orçamento, contrato e aprovação; propostas paradas. Lidera a nota fiscal assistida.",
  },
  {
    nome: "Otávio Leão",
    papel: "Frontend",
    texto: "Interface do agente: chat com cartões de aprovação, leitura do streaming de eventos, criação de conta e login.",
  },
  {
    nome: "Pedro Henrique",
    papel: "Integração, proatividade e documentação",
    texto:
      "Rota de chat com streaming e acompanhamento de propostas paradas. Documentação, pesquisa de mercado e Business Model Canvas.",
  },
] as const;

export const PERGUNTAS = [
  {
    title: "Preciso entender de IA para usar?",
    text: "Não. Você escreve como escreveria no WhatsApp, do seu jeito. Se faltar alguma informação, o agente pergunta antes de preparar qualquer coisa.",
  },
  {
    title: "O agente manda mensagem para o meu cliente sozinho?",
    text: "Não. Orçamento, contrato e mensagem nascem como rascunho e só mudam com o seu clique. Depois de aprovar, você copia o texto ou abre a conversa no WhatsApp do cliente e envia você mesmo.",
  },
  {
    title: "O contrato que ele gera tem validade?",
    text: "É uma minuta: um ponto de partida com os dados do serviço e do cliente. Revise antes de usar. Ela não substitui orientação jurídica.",
  },
  {
    title: "E se o agente errar um valor?",
    text: "O cartão avisa quando a mensagem cita um valor diferente do registrado no serviço. Você edita ou descarta qualquer item antes de aprovar, e o que já foi aprovado não é refeito sem você.",
  },
  {
    title: "Ele ajuda com a nota fiscal?",
    text: "Ajuda a preparar. O agente monta o rascunho da NFS-e de um serviço executado com os dados do cadastro e confere o CPF ou CNPJ do cliente. A emissão continua sendo sua, no Emissor Nacional; depois você registra a nota e o MEIagente compara com o rascunho.",
  },
  {
    title: "O que acontece com os dados dos meus clientes?",
    text: "Eles servem só para operar o MEIagente para você. O agente acessa apenas o contexto do seu negócio, cada ação fica registrada e você pode pedir a exclusão dos dados quando quiser.",
  },
  {
    title: "Quanto custa?",
    text: "O MEIagente está em fase de MVP, construído no AKCIT Camp 2026. O preço ainda não foi definido; a meta é um valor acessível para quem trabalha sozinho.",
  },
] as const;
