import type { Metadata } from "next";
import Link from "next/link";
import Button from "../components/Button";
import Wordmark from "../components/Wordmark";
import { ProcessRail } from "./acervo/process-rail";
import { RevealAccordion } from "./acervo/reveal-accordion";
import { RollerNumber } from "./acervo/roller-number";
import {
  COMPARACAO,
  EQUIPE,
  ETAPAS,
  FONTES,
  GARANTIAS,
  HISTORICO,
  NAV,
  NUMEROS,
  PERGUNTAS,
} from "./conteudo";
import HeroDemo from "./HeroDemo";
import MarcaRodape from "./MarcaRodape";
import Motion from "./Motion";
import Nav from "./Nav";
import "./lp.css";

const title = "MEIagente · você fecha o serviço, o agente faz a papelada";
const description =
  "Escreva o serviço em uma frase. O MEIagente registra, pergunta o que falta e prepara orçamento, contrato e mensagem para o cliente. Nada sai sem a sua aprovação.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: "MEIagente", locale: "pt_BR", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

/**
 * Landing page do MEIagente. Sistema visual: o LANDING-DESIGN-SYSTEM.md (o
 * documento de onde o painel herdou marca, sombras e easings), com a voz da
 * marca do painel: a Fustat nos títulos e a logo com o selo "IA". O selo
 * inclinado (19°) volta como marcador ao longo da página.
 *
 * Aberta no proxy, com ou sem sessão.
 */
export default function LandingPage() {
  return (
    <div className="lp">
      <Motion />
      <Nav />

      <main>
        <Hero />
        <Problema />
        <ComoFunciona />
        <OQueFaz />
        <Comparacao />
        <Seguranca />
        <Equipe />
        <Perguntas />
      </main>

      <Final />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-titulo">
      <div className="lp-shell">
        <h1 id="lp-hero-titulo" className="lp-display" aria-label="Você fecha o serviço. O agente faz a papelada.">
          <span className="lp-hero__line" aria-hidden="true">
            <span>Você fecha o serviço.</span>
          </span>
          <span className="lp-hero__line" aria-hidden="true">
            <span>
              O agente faz a <em className="lp-hero__accent">papelada</em>.
            </span>
          </span>
        </h1>

        <div className="lp-hero__grid">
          <div className="lp-hero__copy">
            <p className="lp-lead">
              Escreva como você fala no WhatsApp. O MEIagente registra o serviço, pergunta o que falta e prepara
              orçamento, contrato e a mensagem para o cliente. Nada sai sem você aprovar.
            </p>
            <div className="lp-hero__actions">
              <Button href="/cadastro">Criar minha conta</Button>
              <Link href="/login" className="lp-textlink text-link">
                Já tenho conta
              </Link>
            </div>
            <p className="lp-hero__para">
              Para eletricistas, técnicos de manutenção, fotógrafos e quem presta serviço sozinho.
            </p>
          </div>
          <div className="lp-hero__demo">
            <HeroDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- problema */

function Problema() {
  return (
    <section className="lp-section lp-problema" aria-labelledby="lp-problema-titulo">
      <div className="lp-shell">
        <h2 id="lp-problema-titulo" className="lp-statement" data-line-reveal>
          Você executa o serviço, atende, orça, escreve contrato, marca a agenda e cobra. Tudo sozinho, entre o
          WhatsApp, a planilha e o papel.
        </h2>

        <div className="lp-problema__dados">
          <p className="lp-problema__intro" data-reveal>
            O Sebrae perguntou aos pequenos negócios como eles usam inteligência artificial. A vontade existe. O
            que falta é saber onde ela entra na rotina.
          </p>
          <ul className="lp-numeros" data-reveal-group>
            {NUMEROS.map((n) => (
              <li key={n.valor + n.texto} className="lp-numero">
                <span className="lp-numero__valor">
                  <RollerNumber value={n.valor} suffix="%" />
                </span>
                <p>
                  {n.texto}
                  <sup>
                    <a href={`#fonte-${n.fonte}`} className="lp-fonte-ref" aria-label={`Fonte ${n.fonte}`}>
                      {n.fonte}
                    </a>
                  </sup>
                </p>
              </li>
            ))}
          </ul>
          <ol className="lp-fontes">
            {FONTES.map((f) => (
              <li key={f.id} id={`fonte-${f.id}`}>
                <span aria-hidden="true">[{f.id}]</span>{" "}
                <a href={f.href} className="text-link" target="_blank" rel="noreferrer">
                  {f.texto}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- como funciona */

const MIDIA_ETAPAS = [
  <div key="1" className="lp-mini">
    <span className="lp-mini__chip">instalação de ar-condicionado</span>
    <span className="lp-mini__chip">R$ 800</span>
    <span className="lp-mini__chip">sexta-feira</span>
  </div>,
  <ul key="2" className="lp-mini lp-mini--lista">
    <li data-ok>Serviço e valor</li>
    <li>Nome do cliente</li>
    <li>WhatsApp</li>
    <li>Endereço</li>
    <li>Forma de pagamento</li>
  </ul>,
  <div key="3" className="lp-mini">
    <p className="lp-bubble dm-bubble lp-bubble--mini">Qual o nome e o WhatsApp do cliente? O pagamento é à vista, Pix ou parcelado?</p>
  </div>,
  <ul key="4" className="lp-mini lp-mini--docs">
    <li>Orçamento #012</li>
    <li>Minuta de contrato</li>
    <li>Mensagem para a Maria</li>
    <li>Sexta, na agenda</li>
  </ul>,
  <div key="5" className="lp-mini lp-mini--botoes">
    <span className="lp-mini__btn lp-mini__btn--sim">Aprovar</span>
    <span className="lp-mini__btn">Editar</span>
    <span className="lp-mini__btn">Descartar</span>
  </div>,
];

function ComoFunciona() {
  return (
    <section id="como-funciona" className="lp-etapas" aria-labelledby="lp-etapas-titulo">
      <ProcessRail
        beadSize={12}
        head={
          <div className="lp-etapas__head">
            <h2 id="lp-etapas-titulo" className="lp-h2">
              Uma frase, cinco etapas.
            </h2>
            <p className="lp-lead">
              “Fechei uma instalação de ar-condicionado por R$ 800 para sexta.” É isso que o agente faz com a sua
              mensagem, nesta ordem.
            </p>
          </div>
        }
        steps={ETAPAS.map((e, i) => ({ ...e, media: MIDIA_ETAPAS[i] }))}
      />
    </section>
  );
}

/* ------------------------------------------------------------ o que faz */

const STATUS_SERVICO = ["rascunho", "orçado", "aguardando resposta", "confirmado", "agendado", "executado", "pago"];

function OQueFaz() {
  return (
    <section className="lp-section lp-faz" aria-labelledby="lp-faz-titulo">
      <div className="lp-shell">
        <div className="lp-head">
          <h2 id="lp-faz-titulo" className="lp-h2" data-line-reveal>
            O que sai das suas mãos.
          </h2>
          <p className="lp-lead" data-reveal>
            Do primeiro contato à cobrança. O agente usa o que você já cadastrou e ainda sugere posts e legendas para
            o Instagram do negócio.
          </p>
        </div>

        <div className="lp-faz__grid">
          <article className="lp-feat lp-feat--a" data-reveal>
            <p className="lp-feat__path">documentos / orçamento</p>
            <h3 className="lp-feat__title">Orçamento e contrato com os dados do seu negócio</h3>
            <div className="lp-feat__art" aria-hidden="true">
              <div className="lp-art-doc">
                <p className="lp-art-doc__head">
                  <span>Orçamento #012</span>
                  <span>Maria Souza</span>
                </p>
                <p>
                  <span>Instalação de ar-condicionado</span>
                  <span>R$ 650,00</span>
                </p>
                <p>
                  <span>Suporte e material</span>
                  <span>R$ 150,00</span>
                </p>
                <p className="lp-art-doc__total">
                  <span>Total</span>
                  <span>R$ 800,00</span>
                </p>
              </div>
              <div className="lp-art-doc lp-art-doc--atras">
                <p className="lp-art-doc__head">
                  <span>Contrato de prestação de serviço</span>
                </p>
                <p className="lp-art-doc__assinatura">
                  <span />
                  <span />
                </p>
              </div>
            </div>
            <p className="lp-feat__body">
              Orçamento, proposta e minuta de contrato saem prontos com os seus preços, os seus clientes e as suas
              condições. O contrato também sai em PDF, com linha de assinatura.
            </p>
          </article>

          <article className="lp-feat lp-feat--b" data-reveal>
            <p className="lp-feat__path">tarefas / propostas paradas</p>
            <h3 className="lp-feat__title">Lembra das propostas que ficaram sem resposta</h3>
            <div className="lp-feat__art" aria-hidden="true">
              <div className="lp-art-lembrete">
                <p className="lp-art-lembrete__meta">
                  <span>Orçamento #009 · Carlos · R$ 450</span>
                  <span className="lp-art-lembrete__dias">4 dias sem resposta</span>
                </p>
                <p className="lp-bubble dm-bubble lp-bubble--mini">
                  Oi, Carlos, tudo bem? Passando para saber se conseguiu ver o orçamento da troca de fiação. Posso
                  ajustar o que precisar.
                </p>
                <p className="lp-mini lp-mini--botoes">
                  <span className="lp-mini__btn lp-mini__btn--sim">Enviar</span>
                  <span className="lp-mini__btn">Editar</span>
                  <span className="lp-mini__btn">Ignorar</span>
                </p>
              </div>
            </div>
            <p className="lp-feat__body">
              Um agendador revisita o que está parado e sugere o próximo passo, com a mensagem pronta. Você decide se
              envia.
            </p>
          </article>

          <article className="lp-feat lp-feat--c" data-reveal>
            <p className="lp-feat__path">serviços / etapas</p>
            <h3 className="lp-feat__title">Cada serviço no seu lugar, do rascunho ao pago</h3>
            <div className="lp-feat__art" aria-hidden="true">
              <ol className="lp-art-etapas">
                {STATUS_SERVICO.map((s) => (
                  <li key={s} data-atual={s === "agendado" ? "" : undefined} data-feito={STATUS_SERVICO.indexOf(s) < 4 ? "" : undefined}>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <p className="lp-feat__body">
              Clientes, serviços, agenda e pagamentos se organizam a partir da conversa. Quadro por etapa e agenda em
              calendário, sem formulário para preencher.
            </p>
          </article>

          <article className="lp-feat lp-feat--d" data-reveal>
            <p className="lp-feat__path">notas / NFS-e</p>
            <h3 className="lp-feat__title">Nota fiscal preparada e conferida antes de você emitir</h3>
            <div className="lp-feat__art" aria-hidden="true">
              <div className="lp-art-nota">
                <p className="lp-art-nota__linha">
                  <span>Rascunho da NFS-e</span>
                  <span className="lp-chip">CNPJ conferido</span>
                </p>
                <p className="lp-art-nota__rotulo">Faturamento do ano frente ao limite do MEI</p>
                <span className="lp-art-nota__barra">
                  <span style={{ width: "62%" }} />
                </span>
                <p className="lp-art-nota__rotulo">Dentro do limite</p>
              </div>
            </div>
            <p className="lp-feat__body">
              O agente monta o rascunho da nota do serviço executado com os dados do cadastro, sem inventar valor nem
              tomador. Você emite no Emissor Nacional e o MEIagente compara com o rascunho.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ comparação */

function Comparacao() {
  const ultima = COMPARACAO.colunas.length - 1;
  return (
    <section className="lp-section lp-comp" aria-labelledby="lp-comp-titulo">
      <div className="lp-shell">
        <div className="lp-head">
          <h2 id="lp-comp-titulo" className="lp-h2" data-line-reveal>
            Por que não usar o que você já tem.
          </h2>
          <p className="lp-lead" data-reveal>
            O assistente genérico escreve, mas não guarda nem acompanha nada. A planilha guarda, mas não faz nada
            sozinha. O app de gestão organiza, mas pede formulário. O MEIagente junta as três coisas a partir de uma
            conversa.
          </p>
        </div>

        <div className="lp-comp__wrap" data-reveal tabIndex={0} role="region" aria-labelledby="lp-comp-titulo">
          <table className="lp-comp__tabela">
            <thead>
              <tr>
                <td />
                {COMPARACAO.colunas.map((c, i) => (
                  <th key={c} scope="col" data-nosso={i === ultima ? "" : undefined}>
                    {i === ultima ? <Wordmark className="text-[0.95rem]" /> : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARACAO.linhas.map(([pergunta, ...respostas]) => (
                <tr key={pergunta}>
                  <th scope="row">{pergunta}</th>
                  {respostas.map((r, i) => (
                    <td key={i} data-nosso={i === ultima ? "" : undefined} data-col={COMPARACAO.colunas[i]}>
                      {r}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lp-nota">Comparação por categoria de ferramenta, sem citar produtos específicos.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- segurança */

function Seguranca() {
  return (
    <section id="seguranca" className="lp-seg" aria-labelledby="lp-seg-titulo">
      <div className="lp-shell">
        <div className="lp-cutout">
          <div className="lp-cutout__copy">
            <h2 id="lp-seg-titulo" className="lp-h2" data-line-reveal>
              Nada sai sem você aprovar.
            </h2>
            <p className="lp-cutout__lead" data-reveal>
              O agente prepara. Você decide. Só depois disso algo chega ao seu cliente.
            </p>
            <ul className="lp-garantias" data-reveal-group>
              {GARANTIAS.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>

          <figure className="lp-log" data-reveal>
            <figcaption className="lp-log__cap">Histórico do serviço da Maria</figcaption>
            <ol className="lp-log__linhas">
              {HISTORICO.map((h) => (
                <li key={h.acao} data-autor={h.autor}>
                  <span className="lp-log__autor">{h.autor}</span>
                  <span className="lp-log__acao">{h.acao}</span>
                  <span className="lp-log__estado" data-estado={h.estado}>
                    {h.estado === "aprovado" ? "Aprovado" : "Rascunho"}
                  </span>
                </li>
              ))}
            </ol>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- equipe */

function Equipe() {
  return (
    <section className="lp-section lp-equipe" aria-labelledby="lp-equipe-titulo">
      <div className="lp-shell lp-equipe__grid">
        <div className="lp-equipe__intro">
          <h2 id="lp-equipe-titulo" className="lp-h2" data-line-reveal>
            Feito por quem vive a rotina.
          </h2>
          <p className="lp-lead" data-reveal>
            O MEIagente nasceu de uma dor real: o Tales, líder técnico da equipe, é MEI e vive o dia a dia que o
            produto quer simplificar. Construído no AKCIT Camp 2026, Edição Regional Nordeste, em Recife.
          </p>
        </div>
        <ul className="lp-equipe__lista" data-reveal-group>
          {EQUIPE.map((p) => (
            <li key={p.nome}>
              <p className="lp-equipe__nome">{p.nome}</p>
              <p className="lp-equipe__papel">{p.papel}</p>
              <p className="lp-equipe__texto">{p.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- perguntas */

function Perguntas() {
  return (
    <section id="perguntas" className="lp-section lp-faq" aria-labelledby="lp-faq-titulo">
      <div className="lp-shell lp-faq__grid">
        <div className="lp-faq__intro">
          <h2 id="lp-faq-titulo" className="lp-h2" data-line-reveal>
            Perguntas de quem está começando.
          </h2>
          <p className="lp-lead">
            Mais sobre dados na{" "}
            <Link href="/privacidade" className="text-link lp-inline">
              política de privacidade
            </Link>{" "}
            e em{" "}
            <Link href="/exclusao-de-dados" className="text-link lp-inline">
              como pedir a exclusão
            </Link>
            .
          </p>
        </div>
        <RevealAccordion className="lp-faq__lista" items={PERGUNTAS.map((p) => ({ ...p }))} defaultOpen={[0]} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------- final e rodapé */

function Final() {
  return (
    <div className="lp-dark">
      <section className="lp-final" aria-labelledby="lp-final-titulo">
        <div className="lp-shell">
          <h2 id="lp-final-titulo" className="lp-final__titulo" data-line-reveal>
            Escreva a primeira frase. <span>O resto chega pronto para você aprovar.</span>
          </h2>
          <div className="lp-final__acoes" data-reveal>
            <Button href="/cadastro" variant="light">
              Criar minha conta
            </Button>
            <Link href="/login" className="lp-textlink text-link">
              Entrar
            </Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-shell">
          <div className="lp-footer__row">
            <div className="lp-footer__marca">
              <p>Assistente do microempreendedor individual. Prepara, organiza e lembra, sempre com a sua aprovação.</p>
            </div>
            <nav className="lp-footer__links" aria-label="Rodapé">
              <ul>
                {NAV.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="text-link">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
              <ul>
                <li>
                  <Link href="/cadastro" className="text-link">
                    Criar conta
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-link">
                    Entrar
                  </Link>
                </li>
              </ul>
              <ul>
                <li>
                  <Link href="/privacidade" className="text-link">
                    Política de privacidade
                  </Link>
                </li>
                <li>
                  <Link href="/exclusao-de-dados" className="text-link">
                    Exclusão de dados
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="lp-footer__row lp-footer__row--legal">
            <p>Desenvolvido para o AKCIT Camp 2026, Edição Regional Nordeste, Recife.</p>
            <p>Código aberto sob a licença MIT.</p>
          </div>
        </div>
        <MarcaRodape />
      </footer>
    </div>
  );
}
