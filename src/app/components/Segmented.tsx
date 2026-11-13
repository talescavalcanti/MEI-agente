import Link from "next/link";

/**
 * Seletor segmentado por link (período, visão). Cada opção é uma URL — o
 * estado mora no searchParam, então voltar no navegador e compartilhar o link
 * funcionam. O item selecionado usa a primária: no sistema é ela que marca o
 * estado vivo (§7.5, `.artifact__plate--live`).
 *
 * No celular cada seletor ocupa a linha toda e as opções dividem a largura
 * por igual: dois seletores lado a lado não cabem em 390px, e empilhados com
 * larguras diferentes a pill da ponta ("Tudo") já saiu cortada.
 */
export default function Segmented<K extends string>({
  label,
  items,
  current,
}: {
  label: string;
  items: Array<{ key: K; label: string; href: string }>;
  current: K;
}) {
  return (
    <nav
      aria-label={label}
      className="flex w-full gap-1 rounded-field bg-surface p-1 shadow-card sm:w-auto"
    >
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.key === current ? "page" : undefined}
          className={`flex-1 whitespace-nowrap rounded-[0.6rem] px-3 py-1.5 text-center text-caption transition-colors sm:flex-none ${
            it.key === current
              ? "bg-brand-500 text-white"
              : "text-slate-500 hover:bg-tonal-blue hover:text-slate-900"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
