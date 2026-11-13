import Link from "next/link";

/**
 * Botão padrão do design system (§7.1 do LANDING-DESIGN-SYSTEM.md).
 *
 * Pílula com um quadrado de ícone à esquerda. No hover a seta sai pela direita
 * enquanto outra entra pela esquerda, e ao mesmo tempo o rótulo rola para cima
 * com uma cópia idêntica subindo por baixo. Tudo em CSS, com a mola
 * `--ease-spring` — nada de JS nem de medição de caixa.
 *
 * O rótulo é duplicado no DOM para o rolamento e a segunda cópia leva
 * `aria-hidden`, senão leitores de tela anunciam o texto duas vezes. É por isso
 * que `children` é tipado `string`: precisa ser texto puro para ser repetido.
 *
 * A lista de props é explícita em vez de estender `<a>`/`<button>`: o painel só
 * precisa destas, e spread de props arbitrárias num componente que já controla
 * `className` e a árvore interna só serviria para alguém passar um `className`
 * que briga com o `overflow` das janelas de seta e rótulo.
 */
export default function Button({
  children,
  href,
  onClick,
  type,
  disabled,
  size = "default",
  variant = "primary",
  block = false,
  external = false,
  title,
}: {
  children: string;
  /** Com `href` vira link; sem, vira `<button>`. */
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "default" | "compact";
  /** `light`: branco, para ir em cima do card de destaque azul. */
  variant?: "primary" | "light";
  /** Ocupa a largura do container. */
  block?: boolean;
  /**
   * `<a>` cru em vez de `<Link>`. Necessário para destinos que não são página
   * do app (um `wa.me`, uma rota de API que redireciona): navegação de
   * cliente não sai do lugar.
   */
  external?: boolean;
  title?: string;
}) {
  const classes = [
    "pm-btn",
    "text-roll-host",
    variant === "light" ? "pm-btn--light" : "pm-btn--primary",
    size === "compact" && "pm-btn--compact",
    block && "pm-btn--block",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span className="pm-btn__icon" aria-hidden="true">
        <ArrowRight />
        <ArrowRight />
      </span>
      <TextRoll>{children}</TextRoll>
    </>
  );

  if (href) {
    if (external) {
      return (
        <a href={href} className={classes} title={title}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} title={title}>
        {inner}
      </Link>
    );
  }

  return (
    <button className={classes} onClick={onClick} type={type} disabled={disabled} title={title}>
      {inner}
    </button>
  );
}

/**
 * Rolamento de texto no hover. O elemento que recebe o hover precisa da classe
 * `text-roll-host` — é ele que dispara o movimento, não este span.
 */
export function TextRoll({ children }: { children: string }) {
  return (
    <span className="text-roll">
      <span className="text-roll__line">{children}</span>
      <span className="text-roll__line" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

/** §7.12 — seta 24×24, stroke 1.7, pontas e junções redondas. */
function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13" />
      <path d="m12.2 5.8 6.3 6.2-6.3 6.2" />
    </svg>
  );
}
