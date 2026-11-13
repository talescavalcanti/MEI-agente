"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "../auth/actions";
import {
  IconCalendar,
  IconChart,
  IconChat,
  IconClose,
  IconDoc,
  IconHome,
  IconLogout,
  IconMenu,
  IconSparkle,
  IconStore,
  IconTool,
  IconUsers,
} from "../components/icons";
import Wordmark from "../components/Wordmark";
import Avatar from "./Avatar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Pílula ao lado do item. Só com número de verdade; sem dado, sem pílula. */
  count?: number;
  /** O que o número conta, para leitor de tela. */
  countLabel?: string;
};
type NavGroup = { title: string | null; items: NavItem[] };

/* O menu do MEIagente (plano, Task 1): o agente logo abaixo do Início, depois
   o cadastro do dia a dia, os rascunhos que esperam aprovação e o perfil do
   negócio. Todo usuário vê tudo: é um MEI por usuário. */
const NAV: NavGroup[] = [
  {
    title: null,
    items: [
      { href: "/painel", label: "Início", icon: <IconHome /> },
      { href: "/painel/agente", label: "Agente", icon: <IconSparkle /> },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { href: "/painel/clientes", label: "Clientes", icon: <IconUsers /> },
      { href: "/painel/servicos", label: "Serviços", icon: <IconTool /> },
      { href: "/painel/agenda", label: "Agenda", icon: <IconCalendar /> },
    ],
  },
  {
    title: "Rascunhos",
    items: [
      { href: "/painel/documentos", label: "Documentos", icon: <IconDoc /> },
      { href: "/painel/notas", label: "Notas", icon: <IconChart /> },
      { href: "/painel/mensagens", label: "Mensagens", icon: <IconChat /> },
    ],
  },
  {
    title: "Conta",
    items: [{ href: "/painel/negocio", label: "Meu negócio", icon: <IconStore /> }],
  },
];

const isActive = (href: string, pathname: string) =>
  href === "/painel" ? pathname === "/painel" : pathname === href || pathname.startsWith(`${href}/`);

/**
 * Casca do painel: sidebar azul fixa à esquerda (≥ lg) ou gaveta (celular), e
 * o conteúdo. O título de cada tela é da própria página (`PageHeader`): é ela
 * que sabe o resumo e as ações dela. Menu não é segurança: cada página chama
 * `requireUser()`.
 */
export default function PainelShell({
  userName,
  navCounts,
  children,
}: {
  userName: string;
  /** Pílula por item do menu (href → número). Ex.: rascunhos esperando aprovação. */
  navCounts?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  /* A gaveta guarda EM QUE página foi aberta: ao navegar, o caminho muda e
     ela fecha sozinha, sem efeito. Fecha também com Esc. */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? pathname : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.map((i) => {
      const n = navCounts?.[i.href];
      return n ? { ...i, count: n, countLabel: n === 1 ? "pendente" : "pendentes" } : i;
    }),
  }));

  const sidebar = <Sidebar groups={groups} pathname={pathname} userName={userName} />;

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      {/* Desktop: fixa. */}
      <aside aria-label="Menu do painel" className="sidebar-brand fixed inset-y-0 left-0 z-30 hidden w-[17rem] lg:block">
        {sidebar}
      </aside>

      {/* Celular: gaveta sobre um véu. */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-[rgba(7,17,31,0.45)] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          aria-label="Menu do painel"
          inert={!open}
          className={`sidebar-brand absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] shadow-lift transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="absolute right-3 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/15"
          >
            <IconClose />
          </button>
          {sidebar}
        </aside>
      </div>

      {/* Só no celular: abre a gaveta. No desktop a sidebar está sempre à
          vista e o título é o cabeçalho da própria página. */}
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-slate-700 shadow-card"
        >
          <IconMenu />
        </button>
        <Link href="/painel" className="min-w-0 flex-1">
          <Wordmark className="text-[1.2rem]" />
        </Link>
      </header>

      {/* `tabIndex={-1}`: o alvo do link de pular precisa poder receber foco. */}
      <main
        id="conteudo"
        tabIndex={-1}
        /* Todas as abas usam a mesma largura máxima; a que pede coluna mais
           estreita (Meu negócio, só formulários) limita a si mesma. */
        className="max-w-[90rem] px-4 pb-24 pt-6 outline-none sm:px-6 lg:px-10 lg:pt-10"
      >
        {children}
      </main>
    </div>
  );
}

function Sidebar({ groups, pathname, userName }: { groups: NavGroup[]; pathname: string; userName: string }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-4 pt-5">
      <Link href="/painel" className="self-start rounded-field px-3 py-1">
        <Wordmark className="wordmark--on-brand text-[1.35rem]" />
      </Link>

      <nav aria-label="Seções do painel" className="mt-5 space-y-3">
        {groups.map((g) => (
          <NavGroupList key={g.title ?? "topo"} group={g} pathname={pathname} />
        ))}
      </nav>

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2 rounded-card bg-white/10 p-2.5">
          <Avatar name={userName} size="sm" />
          <span className="min-w-0 flex-1 truncate text-body-sm text-white">{userName}</span>
          <form action={logout}>
            <button type="submit" className="btn-quiet text-white hover:bg-white/15 hover:text-white">
              <IconLogout className="h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function NavGroupList({ group, pathname }: { group: NavGroup; pathname: string }) {
  const id = group.title ? `menu-${group.title.toLowerCase()}` : undefined;
  return (
    <div>
      {group.title && (
        <p id={id} className="eyebrow px-3 pb-1 text-on-brand-muted">
          {group.title}
        </p>
      )}
      <ul aria-labelledby={id} className="space-y-0.5">
        {group.items.map((it) => {
          const active = isActive(it.href, pathname);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-field px-3 py-[0.35rem] text-body tracking-[-0.01em] text-white transition-colors ${
                  active
                    ? "bg-white/[0.18] font-medium shadow-[0_10px_24px_-14px_rgba(0,20,90,0.7)]"
                    : "hover:bg-white/10"
                }`}
              >
                <span className={active ? "text-white" : "text-on-brand-muted"}>{it.icon}</span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.count != null && (
                  <span className="nums rounded-full bg-white/20 px-2 py-0.5 text-caption text-white">
                    {it.count}
                    {it.countLabel && <span className="sr-only"> {it.countLabel}</span>}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
