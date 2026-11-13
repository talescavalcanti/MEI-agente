"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import capa from "./demo-capa.jpg";
import { VIDEO_DEMO } from "./conteudo";
import { acaoDaTecla, falarTempo, formatarTempo, type AcaoPlayer } from "./video";

const SALTO = 5; // segundos por toque nas setas
const OCIOSO_MS = 2600;

type VideoIOS = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Player da demonstração. O vídeo vem direto do link público (R2), sem cópia
 * no projeto, com `preload="none"`: nada é baixado até a pessoa apertar play.
 * A capa é um quadro do próprio vídeo (`demo-capa.jpg`).
 *
 * Controles próprios na identidade da landing: o play é o selo da logo
 * (paralelogramo a 19°), a barra some quando o vídeo toca sem mexer o mouse.
 * Atalhos: espaço/K, setas ou J/L (5 s), M e F.
 */
export default function DemoVideo() {
  const palco = useRef<HTMLDivElement>(null);
  const video = useRef<VideoIOS>(null);
  const timer = useRef<number | undefined>(undefined);

  const [iniciado, setIniciado] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [duracao, setDuracao] = useState<number>(VIDEO_DEMO.duracao);
  const [mudo, setMudo] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [ocioso, setOcioso] = useState(false);

  const acordar = useCallback(() => {
    setOcioso(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOcioso(true), OCIOSO_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const mudou = () => setCheia(document.fullscreenElement === palco.current);
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  const tocar = useCallback(() => {
    const v = video.current;
    if (!v) return;
    setIniciado(true);
    acordar();
    v.play().catch(() => setTocando(false));
  }, [acordar]);

  const alternar = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) tocar();
    else v.pause();
  }, [tocar]);

  const pular = useCallback((delta: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration || VIDEO_DEMO.duracao);
  }, []);

  const alternarMudo = useCallback(() => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMudo(v.muted);
  }, []);

  const alternarTelaCheia = useCallback(() => {
    const p = palco.current;
    const v = video.current;
    if (!p || !v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (p.requestFullscreen) {
      p.requestFullscreen().catch(() => {});
    } else {
      v.webkitEnterFullscreen?.(); // Safari do iPhone só põe o <video> em tela cheia
    }
  }, []);

  const executar = (acao: AcaoPlayer) => {
    acordar();
    if (acao === "alternar") alternar();
    else if (acao === "voltar") pular(-SALTO);
    else if (acao === "avancar") pular(SALTO);
    else if (acao === "mudo") alternarMudo();
    else alternarTelaCheia();
  };

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const alvo = e.target as HTMLElement;
    const acao = acaoDaTecla(e.key);
    if (!acao) return;
    // A barra de progresso já anda com as setas; o botão já aperta com espaço.
    if (alvo.tagName === "INPUT" && (acao === "voltar" || acao === "avancar")) return;
    if (alvo.tagName === "BUTTON" && e.key === " ") return;
    e.preventDefault();
    executar(acao);
  };

  const progresso = duracao > 0 ? Math.min(tempo / duracao, 1) : 0;
  const escondeBarra = iniciado && tocando && ocioso && !esperando;

  return (
    <div
      ref={palco}
      className="lp-video"
      data-iniciado={iniciado ? "" : undefined}
      data-tocando={tocando ? "" : undefined}
      data-ocioso={escondeBarra ? "" : undefined}
      data-cheia={cheia ? "" : undefined}
      onPointerMove={iniciado ? acordar : undefined}
      onKeyDown={teclado}
    >
      <video
        ref={video}
        className="lp-video__midia"
        src={VIDEO_DEMO.src}
        poster={capa.src}
        width={VIDEO_DEMO.largura}
        height={VIDEO_DEMO.altura}
        preload="none"
        playsInline
        aria-label={`${VIDEO_DEMO.titulo}, ${falarTempo(VIDEO_DEMO.duracao)}`}
        onClick={() => {
          // No toque, o primeiro toque só mostra a barra.
          if (escondeBarra) acordar();
          else alternar();
        }}
        onPlay={() => {
          setTocando(true);
          setTerminou(false);
        }}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setTerminou(true);
          setOcioso(false);
        }}
        onWaiting={() => setEsperando(true)}
        onPlaying={() => setEsperando(false)}
        onCanPlay={() => setEsperando(false)}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuracao(e.currentTarget.duration);
        }}
        onVolumeChange={(e) => setMudo(e.currentTarget.muted)}
      >
        <a href={VIDEO_DEMO.src}>Abrir o vídeo da demonstração</a>
      </video>

      {!iniciado && (
        <button type="button" className="lp-video__capa" onClick={tocar}>
          <span className="lp-video__play" aria-hidden="true">
            <IconePlay />
          </span>
          <span className="lp-video__rotulo">
            Assistir à demonstração
            <span className="lp-video__duracao">
              <span aria-hidden="true">{formatarTempo(VIDEO_DEMO.duracao)}</span>
              <span className="sr-only">, {falarTempo(VIDEO_DEMO.duracao)}</span>
            </span>
          </span>
        </button>
      )}

      {iniciado && esperando && <span className="lp-video__carregando" role="status" aria-label="Carregando" />}

      {iniciado && (
        <div className="lp-video__barra" onFocus={acordar}>
          <button
            type="button"
            className="lp-video__btn"
            onClick={alternar}
            aria-label={tocando ? "Pausar" : terminou ? "Assistir de novo" : "Continuar"}
          >
            {tocando ? <IconePausa /> : terminou ? <IconeDeNovo /> : <IconePlay />}
          </button>

          <span className="lp-video__tempo" aria-hidden="true">
            {formatarTempo(tempo)} <span>/ {formatarTempo(duracao)}</span>
          </span>

          <input
            type="range"
            className="lp-video__progresso"
            min={0}
            max={duracao}
            step={0.1}
            value={tempo}
            aria-label="Posição no vídeo"
            aria-valuetext={`${falarTempo(tempo)} de ${falarTempo(duracao)}`}
            style={{ "--lp-progresso": `${progresso * 100}%` } as CSSProperties}
            onChange={(e) => {
              const v = video.current;
              const t = Number(e.currentTarget.value);
              if (v) v.currentTime = t;
              setTempo(t);
            }}
          />

          <button
            type="button"
            className="lp-video__btn"
            onClick={alternarMudo}
            aria-label={mudo ? "Ligar o som" : "Tirar o som"}
            aria-pressed={mudo}
          >
            {mudo ? <IconeMudo /> : <IconeSom />}
          </button>

          <button
            type="button"
            className="lp-video__btn"
            onClick={alternarTelaCheia}
            aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {cheia ? <IconeSairTela /> : <IconeTela />}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- ícones */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function IconePlay() {
  return (
    <Svg>
      <path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.2-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z" fill="currentColor" />
    </Svg>
  );
}

function IconePausa() {
  return (
    <Svg>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
    </Svg>
  );
}

function IconeDeNovo() {
  return (
    <Svg>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 4v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconeSom() {
  return (
    <Svg>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

function IconeMudo() {
  return (
    <Svg>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
      <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

function IconeTela() {
  return (
    <Svg>
      <path
        d="M4.5 9V5.5a1 1 0 0 1 1-1H9m6 0h3.5a1 1 0 0 1 1 1V9m0 6v3.5a1 1 0 0 1-1 1H15m-6 0H5.5a1 1 0 0 1-1-1V15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function IconeSairTela() {
  return (
    <Svg>
      <path
        d="M9 4.5V8a1 1 0 0 1-1 1H4.5m15 0H16a1 1 0 0 1-1-1V4.5m0 15V16a1 1 0 0 1 1-1h3.5m-15 0H8a1 1 0 0 1 1 1v3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}
