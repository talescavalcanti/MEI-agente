import Wordmark from "./Wordmark";

/**
 * Moldura das telas fora do painel (entrar, primeiro acesso).
 *
 * Um bloco só sobre o canvas, no idioma do painel: o formulário num cartão
 * branco e, a partir de `lg`, o card de destaque azul ao lado dizendo o que o
 * produto faz. Sem navegação: quem está aqui ainda não tem para onde navegar.
 * No celular sobra só o formulário — o painel azul seria rolagem à toa.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-[26rem] lg:max-w-[56rem]">
        <div className="mb-6 px-1">
          <Wordmark className="text-[1.3rem]" />
        </div>

        <div className="grid gap-3 rounded-panel bg-surface p-3 shadow-card lg:grid-cols-[1fr_1fr]">
          <div className="p-5 sm:p-7">
            <h1 className="text-title-page tracking-[-0.04em]">{title}</h1>
            <p className="mt-1.5 text-body-sm text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <BrandPanel />
        </div>
      </div>
    </main>
  );
}

/**
 * O card de destaque: azul da marca com os arcos e a conversa com o agente em
 * miniatura. Puro enfeite para quem vê (`aria-hidden`): o que importa nesta
 * tela é o formulário. Branco sobre #0052ff passa de 6:1.
 */
function BrandPanel() {
  return (
    <div
      aria-hidden="true"
      className="relative isolate hidden overflow-hidden rounded-[1rem] bg-brand-500 p-8 text-white lg:flex lg:flex-col"
    >
      <svg viewBox="0 0 200 200" className="absolute -right-20 -top-24 -z-10 h-96 w-96 text-white/10">
        <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="22" />
        <circle cx="100" cy="100" r="98" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p className="font-heading text-title-page font-bold leading-[1.1] tracking-[-0.04em]">
        Fale do serviço. O agente prepara o resto.
      </p>
      <p className="mt-2 max-w-[18rem] text-body-sm leading-snug text-white/90">
        Orçamento, minuta e mensagem para o cliente, tudo como rascunho até você aprovar.
      </p>

      <div className="mt-auto space-y-2 pt-10">
        <div className="flex justify-end">
          <span className="max-w-[80%] rounded-[1rem_1rem_0.25rem_1rem] bg-white/15 px-3 py-2 text-body-sm">
            Fechei uma instalação de ar por R$ 800 para sexta.
          </span>
        </div>
        <div className="max-w-[80%] rounded-[1rem_1rem_1rem_0.25rem] bg-white px-3 py-2 text-body-sm text-slate-900">
          Preparei o orçamento e a mensagem de confirmação.
          <span className="mt-1.5 block rounded-chip bg-brand-50 px-2 py-1.5 text-center text-brand-600">
            Revisar e aprovar
          </span>
        </div>
      </div>
    </div>
  );
}

/** Campo de formulário das telas de auth. Mesmo idioma do painel. */
export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  autoFocus,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  hint?: string;
}) {
  /* O campo do sistema (`.field` no globals.css): contorno de 3:1 no
     repouso — sem ele o campo vazio sumia no cartão —, foco na primária e
     16px no celular para o iPhone não dar zoom. */
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        required
        className="field"
      />
      {hint && <span className="mt-1.5 block text-caption text-muted">{hint}</span>}
    </label>
  );
}

/** Recado de erro do formulário. Tom do sistema, não vermelho de alerta cru. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-field bg-danger-bg px-4 py-3 text-body-sm text-danger-text"
    >
      {children}
    </p>
  );
}
