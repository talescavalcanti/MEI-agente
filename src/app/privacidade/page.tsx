import Link from "next/link";
import Wordmark from "../components/Wordmark";

export const metadata = {
  title: "Política de privacidade · MEIagente",
  description: "Quais dados o MEIagente coleta, como usa, onde guarda e como pedir a exclusão.",
};

const CONTATO = "talescavalcanti06@gmail.com";

/**
 * Página pública (aberta no proxy, com ou sem sessão). A Meta exige a URL
 * desta política para publicar o app que recebe as mensagens do Instagram e
 * do WhatsApp. Ao mudar o texto, atualize a data.
 */
export default function PrivacidadePage() {
  return (
    <main className="px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-[44rem]">
        <Link href="/" className="mb-6 inline-block px-1">
          <Wordmark className="text-[1.3rem]" />
        </Link>

        <article className="rounded-panel bg-surface p-6 shadow-card sm:p-10">
          <h1 className="text-title-page tracking-[-0.04em]">Política de privacidade</h1>
          <p className="mt-1.5 text-body-sm text-muted">Atualizada em 13/11/2026.</p>

          <div className="mt-8 space-y-8 text-body leading-relaxed text-muted-on-tint">
            <Secao titulo="Quem somos">
              <p>
                O MEIagente é um assistente para microempreendedores individuais (MEI). Ele ajuda a organizar
                clientes, serviços, orçamentos, contratos, agenda e cobranças a partir de uma conversa com um agente
                de inteligência artificial. Dúvidas sobre esta política ou sobre seus dados:{" "}
                <a href={`mailto:${CONTATO}`} className="text-link font-medium text-brand-600">
                  {CONTATO}
                </a>
                .
              </p>
            </Secao>

            <Secao titulo="Dados que coletamos">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="font-medium text-ink">Sua conta:</strong> nome e email. A senha é guardada só
                  como hash, nunca em texto.
                </li>
                <li>
                  <strong className="font-medium text-ink">Seu negócio:</strong> nome, atividade, cidade, serviços,
                  valores, orçamentos, contratos, agenda, pagamentos, tarefas, mensagens preparadas para clientes e
                  o que você ensina ao agente sobre o seu trabalho.
                </li>
                <li>
                  <strong className="font-medium text-ink">Seus clientes:</strong> o que você cadastra, como nome,
                  WhatsApp e endereço, e o histórico de serviços com cada um.
                </li>
                <li>
                  <strong className="font-medium text-ink">Conversas com o agente:</strong> o que você escreve, as
                  respostas e o registro de cada ação que o agente fez ou que você aprovou.
                </li>
                <li>
                  <strong className="font-medium text-ink">Mensagens do Instagram e do WhatsApp:</strong> quando você
                  liga uma conta do seu negócio, a Meta envia ao MEIagente as mensagens diretas que essa conta
                  recebe. Guardamos o identificador de quem enviou no canal (o id do Instagram ou o número do
                  WhatsApp), o nome do perfil quando a Meta informa, o texto, o tipo da mensagem e o horário. Não
                  recebemos mensagens de contas que não foram ligadas.
                </li>
                <li>
                  <strong className="font-medium text-ink">Registros técnicos:</strong> horário, rota e erros das
                  requisições, usados para o app funcionar e para segurança.
                </li>
              </ul>
            </Secao>

            <Secao titulo="Como usamos">
              <p>
                Os dados servem só para operar o MEIagente para você: mostrar o painel, preparar documentos e
                mensagens e lembrar o que está pendente. Orçamento, contrato e mensagem nascem como rascunho e nada
                é enviado a ninguém sem a sua aprovação.
              </p>
              <p>
                Não vendemos, não alugamos e não compartilhamos dados para publicidade ou marketing. O MEIagente não
                mostra anúncios.
              </p>
            </Secao>

            <Secao titulo="Inteligência artificial">
              <p>
                O agente usa um modelo de linguagem acessado pela Featherless. Para responder, enviamos a ela o texto
                da conversa e o contexto do negócio necessário àquela resposta. O modelo sugere; quem decide é você.
              </p>
            </Secao>

            <Secao titulo="Onde os dados ficam">
              <p>
                O banco de dados fica no Supabase e a aplicação roda na Vercel. O acesso ao banco é feito só pelo
                servidor, e cada negócio enxerga apenas os próprios dados. Supabase, Vercel e Featherless podem
                tratar dados fora do Brasil, dentro dos termos de cada um.
              </p>
            </Secao>

            <Secao titulo="Por quanto tempo guardamos">
              <p>
                Guardamos os dados enquanto sua conta existir. Quando você pede a exclusão, apagamos a conta e tudo o
                que está ligado a ela em até 15 dias. Registros técnicos e cópias de segurança dos provedores expiram
                sozinhos, no ciclo de cada provedor, e não são usados depois da exclusão.
              </p>
            </Secao>

            <Secao titulo="Dados dos seus clientes">
              <p>
                Sobre os dados dos clientes que você cadastra ou que mandam mensagem para o seu negócio, você é o
                controlador e o MEIagente trata esses dados em seu nome, só para as finalidades acima.
              </p>
            </Secao>

            <Secao titulo="Seus direitos (LGPD)">
              <p>Pela Lei Geral de Proteção de Dados, você pode pedir a qualquer momento:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>confirmação de que tratamos seus dados e acesso a eles;</li>
                <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
                <li>portabilidade dos dados;</li>
                <li>informação sobre com quem compartilhamos;</li>
                <li>eliminação dos dados e revogação do consentimento.</li>
              </ul>
              <p>
                Para isso, escreva para{" "}
                <a href={`mailto:${CONTATO}`} className="text-link font-medium text-brand-600">
                  {CONTATO}
                </a>
                . O passo a passo da exclusão está em{" "}
                <Link href="/exclusao-de-dados" className="text-link font-medium text-brand-600">
                  Exclusão de dados
                </Link>
                .
              </p>
            </Secao>

            <Secao titulo="Mudanças nesta política">
              <p>
                Quando esta política mudar, a data no topo da página muda junto. Mudanças importantes serão avisadas
                no próprio app.
              </p>
            </Secao>
          </div>
        </article>
      </div>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-title-card font-semibold tracking-[-0.02em] text-ink">{titulo}</h2>
      {children}
    </section>
  );
}
