import Link from "next/link";
import Wordmark from "../components/Wordmark";

export const metadata = {
  title: "Exclusão de dados · MEIagente",
  description: "Como pedir a exclusão dos seus dados do MEIagente, o prazo e o que é apagado.",
};

const CONTATO = "talescavalcanti06@gmail.com";

/**
 * Página pública (aberta no proxy, com ou sem sessão). É a "URL de instruções
 * para exclusão de dados" que a Meta exige para publicar o app. Ao mudar o
 * texto, atualize a data.
 */
export default function ExclusaoDeDadosPage() {
  return (
    <main className="px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-[44rem]">
        <Link href="/" className="mb-6 inline-block px-1">
          <Wordmark className="text-[1.3rem]" />
        </Link>

        <article className="rounded-panel bg-surface p-6 shadow-card sm:p-10">
          <h1 className="text-title-page tracking-[-0.04em]">Exclusão de dados</h1>
          <p className="mt-1.5 text-body-sm text-muted">Atualizada em 13/11/2026.</p>

          <div className="mt-8 space-y-8 text-body leading-relaxed text-muted-on-tint">
            <p>
              Você pode pedir a qualquer momento que o MEIagente apague os seus dados. Isso vale para quem tem conta
              no MEIagente e também para quem mandou mensagem pelo Instagram ou pelo WhatsApp a um negócio que usa o
              MEIagente.
            </p>

            <Secao titulo="Como pedir">
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  Envie um email para{" "}
                  <a
                    href={`mailto:${CONTATO}?subject=${encodeURIComponent("Exclusão de dados")}`}
                    className="text-link font-medium text-brand-600"
                  >
                    {CONTATO}
                  </a>{" "}
                  com o assunto <strong className="font-medium text-ink">Exclusão de dados</strong>.
                </li>
                <li>
                  <strong className="font-medium text-ink">Se você tem conta:</strong> envie a partir do email
                  cadastrado na conta, ou informe esse email no texto.
                </li>
                <li>
                  <strong className="font-medium text-ink">Se você mandou mensagem a um negócio:</strong> informe o
                  seu usuário do Instagram ou o seu número de WhatsApp e, se souber, o nome do negócio.
                </li>
                <li>
                  Podemos pedir uma confirmação de que o pedido é seu, como uma resposta a partir do email da conta.
                  Não pedimos senha.
                </li>
              </ol>
            </Secao>

            <Secao titulo="Prazo">
              <p>
                Confirmamos o recebimento do pedido em até 5 dias úteis. A exclusão é concluída em até 15 dias depois
                da confirmação, e avisamos por email quando terminar.
              </p>
            </Secao>

            <Secao titulo="O que é apagado">
              <p>
                <strong className="font-medium text-ink">Para quem tem conta,</strong> apagamos a conta e tudo o que
                está ligado a ela:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>dados da conta e do negócio;</li>
                <li>clientes, serviços, orçamentos, contratos, agenda, pagamentos e tarefas;</li>
                <li>mensagens preparadas, conversas com o agente e o registro das ações;</li>
                <li>o que você ensinou ao agente sobre o seu trabalho;</li>
                <li>contas do Instagram e do WhatsApp ligadas e as mensagens recebidas por elas.</li>
              </ul>
              <p>
                <strong className="font-medium text-ink">Para quem mandou mensagem a um negócio,</strong> apagamos as
                mensagens recebidas do seu usuário ou número. Se o negócio também cadastrou você como cliente, avisamos
                o negócio, que é o responsável por esse cadastro.
              </p>
            </Secao>

            <Secao titulo="O que não depende de nós">
              <p>
                Registros técnicos e cópias de segurança dos provedores expiram sozinhos, no ciclo de cada provedor, e
                não são usados depois da exclusão. As mensagens continuam no Instagram e no WhatsApp, que são da Meta:
                para apagar por lá, use as opções dos próprios apps.
              </p>
            </Secao>

            <p>
              Mais detalhes sobre quais dados tratamos estão na{" "}
              <Link href="/privacidade" className="text-link font-medium text-brand-600">
                Política de privacidade
              </Link>
              .
            </p>
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
