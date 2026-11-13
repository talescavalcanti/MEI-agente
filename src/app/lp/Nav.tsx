"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../components/Button";
import Wordmark from "../components/Wordmark";
import { NAV } from "./conteudo";

/**
 * Navbar da landing (§7.3 do LANDING-DESIGN-SYSTEM): pílula fixa,
 * transparente em repouso e branca com sombra depois de 48px de rolagem.
 * Aqui a geometria não é scrubada pelo GSAP; só a superfície muda, por
 * classe, com a transição de 0.75s do sistema.
 */
export default function Nav() {
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 48);
    ver();
    window.addEventListener("scroll", ver, { passive: true });
    return () => window.removeEventListener("scroll", ver);
  }, []);

  return (
    <header className="lp-nav">
      <nav className={`lp-nav__shell${rolou ? " is-scrolled" : ""}`} aria-label="Principal">
        <Link href="/lp" className="lp-nav__brand" aria-label="MEIagente, início">
          <Wordmark className="text-[1.05rem]" />
        </Link>
        <ul className="lp-nav__links">
          {NAV.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-link">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="lp-nav__end">
          <Link href="/login" className="lp-nav__login text-link">
            Entrar
          </Link>
          <Button href="/cadastro" size="compact">
            Criar conta
          </Button>
        </div>
      </nav>
    </header>
  );
}
