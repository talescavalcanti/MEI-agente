// Process Rail: passos ao longo de uma linha. No scroll, uma conta desenha a linha atrás de si e cada
// passo acende quando ela chega: o número rola e a imagem aparece por baixo e fica.
// A raiz é a trilha de scroll e o palco é position: sticky (sem pin em JS). No mobile a linha fica vertical.
// Motor imperativo: o componente <ProcessRail> renderiza trilho, svgs e passos e chama createProcessRail().
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger, gsap } from "../kit/core";
import { registerSoftEases, type DisableAt } from "../kit/anm";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, DrawSVGPlugin);

export type ProcessRailOptions = {
  /** Suavização do scrub (s); 0 → segue a barra exatamente. */
  scrub?: number;
  /** Diâmetro da conta (px). */
  beadSize?: number;
  /** Palco sticky numa trilha alta (desktop). */
  sticky?: boolean;
  /** Atraso entre o cartão, a imagem e o número de um passo (s). */
  stagger?: number;
  disable?: DisableAt[];
};

export type ProcessRailApi = { refresh(): void; scrollTo(i: number): void; kill(): void };

type Pt = { x: number; y: number };
type Current = { isMobile: boolean; path: SVGPathElement; pts: Pt[]; anchors: number[] | null; start: Pt | null; end: Pt | null };
type Step = {
  el: HTMLElement; btn: HTMLElement; num: HTMLElement | null; media: HTMLElement | null; numText: string;
  strips: HTMLElement[]; hidden: number[]; targets: number[]; tier: number; shown: boolean; rolled: boolean;
};

export function createProcessRail(container: HTMLElement, o: ProcessRailOptions = {}): ProcessRailApi | null {
  registerSoftEases();
  const railQ = container.querySelector<HTMLElement>('[data-anm-prl-rail]');
  const beadQ = container.querySelector<HTMLElement>('[data-anm-prl-bead]');
  const paths = Array.from(container.querySelectorAll<SVGPathElement>('[data-anm-prl-path]'));
  const stepEls = Array.from(container.querySelectorAll<HTMLElement>('[data-anm-prl-step]'));
  if (!railQ || !beadQ || !paths.length || !stepEls.length) return null;
  const rail = railQ;
  const bead = beadQ;

  // --- 2. Config ---
  const scrubNum = o.scrub ?? 0.6;
  const scrub: number | true = scrubNum > 0 ? scrubNum : true;
  const beadSize = o.beadSize ?? 10;
  const sticky = o.sticky ?? true;
  const stagger = o.stagger ?? 0.08;
  const disableList: string[] = o.disable ?? [];

  // --- 3. Constants ---
  const EASE = 'softOut';
  // extra scroll the sticky stage holds for, in viewport heights
  const TRACK_VH = 200;
  // a click scrolls just past the step's anchor, so the step is reached
  const ARRIVE = 0.02;
  // only the bead and the line are scrubbed; a step's arrival plays in seconds
  // when the bead reaches it and plays back when the page scrolls above it
  const CARD_DUR = 0.5;
  const MEDIA_DUR = 0.8;
  const ROLL_DUR = 0.6;
  const ROLL_STAGGER = 0.05;
  // opacity tiers: not reached yet, already passed, active is 1
  const UPCOMING = 0.42;
  const VISITED = 0.72;
  // a step's image scales up from MEDIA_FROM when the bead reaches it, then stays
  const MEDIA_FROM = 0.9;
  // on mobile the bead reaches a step's number as that number crosses this height
  // in the viewport (the stage does not stick there)
  const MOBILE_READ = '60%';
  const BREAKPOINTS: Record<string, string> = {
    mobile: '(max-width: 479px)',
    landscape: '(orientation: landscape) and (max-width: 767px)',
    tablet: '(max-width: 991px)',
    desktop: '(min-width: 992px)',
  };

  // --- 4. State ---
  let tl: gsap.core.Timeline | null = null;
  let current: Current | null = null;
  let active = -1;
  let reduced = false;
  let resizeTimer = 0;
  const steps: Step[] = [];
  const ghosts = new Map<SVGPathElement, SVGPathElement>();
  const mm = gsap.matchMedia();

  // --- 5. Helpers ---
  // Where each step sits on the line, as path progress. layout() measures it:
  // desktop, the middle of each step's column; mobile, each step's number.
  function anchorAt(i: number) {
    return current && current.anchors ? current.anchors[i] : 0;
  }

  function pathFor(isMobile: boolean) {
    const want = isMobile ? 'mobile' : 'desktop';
    return paths.find(function (p) { return p.dataset.anmPrlPath === want; }) || paths[0];
  }

  // The index text becomes one column per digit: a 1em window over a strip
  // of glyphs 0..d that starts one glyph below the window (empty slot) and
  // rolls up until d is in view. Non-digits stay as plain text.
  function buildColumns(host: HTMLElement) {
    const text = (host.textContent || '').trim();
    const strips: HTMLElement[] = [];
    const hidden: number[] = [];
    const targets: number[] = [];
    host.textContent = '';
    text.split('').forEach(function (ch) {
      if (!/[0-9]/.test(ch)) {
        const plain = document.createElement('span');
        plain.textContent = ch;
        host.appendChild(plain);
        return;
      }
      const d = parseInt(ch, 10);
      const len = d + 1;
      const col = document.createElement('span');
      col.className = 'prl_col';
      const strip = document.createElement('span');
      strip.className = 'prl_strip';
      for (let g = 0; g <= d; g++) {
        const glyph = document.createElement('span');
        glyph.className = 'prl_glyph';
        glyph.textContent = String(g);
        strip.appendChild(glyph);
      }
      col.appendChild(strip);
      host.appendChild(col);
      strips.push(strip);
      hidden.push(100 / len);
      targets.push(-d * 100 / len);
    });
    return { strips: strips, hidden: hidden, targets: targets };
  }

  function ghostOf(path: SVGPathElement) {
    const ghost = path.cloneNode(false) as SVGPathElement;
    ghost.removeAttribute('data-anm-prl-path');
    ghost.setAttribute('class', 'prl_path_ghost');
    path.parentNode!.insertBefore(ghost, path);
    ghosts.set(path, ghost);
  }

  // Fits the line to the steps and measures where each step sits on it. The svg's
  // viewBox is the element's own pixel size, so path units are pixels.
  // Desktop: the steps are equal CSS grid columns, the line runs the rail's full
  // width (its left end is the first step's left edge) and a step's anchor is
  // the middle of its column. Mobile: the steps are equal-height rows, so every
  // step already holds the room its image needs, and the vertical line runs from
  // the first step's number to the last one's.
  function layout() {
    if (!current) return;
    const path = current.path;
    const svg = path.ownerSVGElement!;
    const rr = rail.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(sr.width));
    const h = Math.max(1, Math.round(sr.height));
    const n = steps.length;
    let d: string;
    if (current.isMobile) {
      const ys = steps.map(function (s) {
        const r = (s.num || s.el).getBoundingClientRect();
        return Math.round(r.top - sr.top + r.height / 2);
      });
      d = 'M ' + w / 2 + ' ' + ys[0] + ' L ' + w / 2 + ' ' + ys[n - 1];
      current.anchors = steps.map(function (s, i) { return n > 1 ? i / (n - 1) : 0.5; });
    } else {
      d = 'M 0 ' + h / 2 + ' L ' + w + ' ' + h / 2;
      current.anchors = steps.map(function (s) {
        const r = s.el.getBoundingClientRect();
        return gsap.utils.clamp(0, 1, (r.left + r.width / 2 - sr.left) / w);
      });
    }
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    if (path.getAttribute('d') !== d) {
      path.setAttribute('d', d);
      const ghost = ghosts.get(path);
      if (ghost) ghost.setAttribute('d', d);
    }
    const raw = MotionPathPlugin.getRawPath(path);
    MotionPathPlugin.cacheRawPathMeasurements(raw);
    const toRail = function (pt: { x: number; y: number }) { return { x: sr.left - rr.left + pt.x, y: sr.top - rr.top + pt.y }; };
    const cur = current;
    cur.pts = steps.map(function (s, i) { return toRail(MotionPathPlugin.getPositionOnPath(raw, anchorAt(i))); });
    current.start = toRail(MotionPathPlugin.getPositionOnPath(raw, 0));
    current.end = toRail(MotionPathPlugin.getPositionOnPath(raw, 1));
  }

  function stepIndexAt(progress: number) {
    // nothing is reached before the page has scrolled into the track, even where
    // the line starts exactly on the first step (mobile)
    if (!tl || progress <= 0) return -1;
    const t = progress * tl!.duration();
    let idx = -1;
    steps.forEach(function (s, i) { if (t >= anchorAt(i) - 0.0001) idx = i; });
    return idx;
  }

  // The bead's position picks the active step; what a step does on arrival is a
  // normal tween, not scrubbed. Reached steps keep their number and image, and
  // scrolling back above a step plays its arrival back out.
  function setActive(i: number) {
    if (i === active) return;
    active = i;
    steps.forEach(function (s, k) {
      if (k === i) s.btn.setAttribute('aria-current', 'step');
      else s.btn.removeAttribute('aria-current');
      const reached = k <= i;
      setTier(s, k === i ? 1 : (reached ? VISITED : UPCOMING));
      showMedia(s, reached);
      rollNumber(s, reached);
    });
  }

  // Tear-down without playing anything back; the next build parks every step.
  function clearActive() {
    active = -1;
    steps.forEach(function (s) {
      s.btn.removeAttribute('aria-current');
      gsap.killTweensOf([s.el, s.media].concat(s.strips).filter(Boolean));
    });
  }

  function setTier(s: Step, opacity: number) {
    if (s.tier === opacity) return;
    s.tier = opacity;
    if (reduced) {
      gsap.set(s.el, { opacity: opacity });
      return;
    }
    gsap.to(s.el, {
      opacity: opacity, duration: CARD_DUR, ease: EASE, overwrite: true,
    });
  }

  function showMedia(s: Step, reached: boolean) {
    if (!s.media || s.shown === reached) return;
    s.shown = reached;
    const to: gsap.TweenVars = reached ? { opacity: 1, scale: 1 } : { opacity: 0, scale: MEDIA_FROM };
    if (reduced) {
      gsap.set(s.media, to);
      return;
    }
    gsap.to(s.media, Object.assign(to, {
      duration: reached ? MEDIA_DUR : MEDIA_DUR * 0.6,
      delay: reached ? stagger : 0,
      ease: EASE, overwrite: true, force3D: true,
    }));
  }

  // Digits roll up into their slot when the step is reached and back down out
  // of it when the page scrolls above the step.
  function rollNumber(s: Step, reached: boolean) {
    if (!s.strips.length || s.rolled === reached) return;
    s.rolled = reached;
    const to = function (k: number) { return reached ? s.targets[k] : s.hidden[k]; };
    if (reduced) {
      s.strips.forEach(function (strip, k) { gsap.set(strip, { yPercent: to(k) }); });
      return;
    }
    gsap.to(s.strips, {
      yPercent: function (k: number) { return to(k); },
      duration: ROLL_DUR,
      delay: reached ? stagger * 2 : 0,
      ease: EASE,
      stagger: reached ? ROLL_STAGGER : -ROLL_STAGGER,
      overwrite: true,
      force3D: true,
    });
  }

  // The scrub stays the single source of truth: a click only moves the
  // page to the scroll position where that step has arrived.
  function scrollToStep(i: number) {
    if (!tl || !tl.scrollTrigger || i < 0 || i >= steps.length) return;
    const st = tl.scrollTrigger;
    const t = Math.min(tl.duration(), anchorAt(i) + ARRIVE);
    const top = st.start + (st.end - st.start) * (t / tl.duration());
    const scroller = (st.scroller && st.scroller !== window ? st.scroller : window) as Window | HTMLElement;
    scroller.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
  }

  // --- 6. Animation routines ---
  // No ScrollTrigger pin anywhere. Desktop (unless data-anm-sticky="false"): the
  // root is a tall track and the stage inside it is CSS position: sticky, so the
  // scrub simply runs from the track's top to its bottom. Phones never stick,
  // because four stacked steps with images are taller than the screen: the track
  // runs from the first step's number to the last crossing MOBILE_READ, clamped
  // to the page so a block near the top does not start part-way through.
  function makeTrigger(): ScrollTrigger.Vars {
    const cur = current!;
    const base: ScrollTrigger.Vars = {
      scrub: scrub,
      invalidateOnRefresh: true,
      onRefreshInit: layout,
      onUpdate: function (self: ScrollTrigger) { setActive(stepIndexAt(self.progress)); },
    };
    if (cur.isMobile) {
      return Object.assign(base, {
        trigger: rail,
        start: function () { return 'clamp(top+=' + Math.round(cur.pts[0].y) + ' ' + MOBILE_READ + ')'; },
        end: function () { return 'clamp(top+=' + Math.round(cur.pts[cur.pts.length - 1].y) + ' ' + MOBILE_READ + ')'; },
      });
    }
    if (sticky) {
      return Object.assign(base, { trigger: container, start: 'top top', end: 'bottom bottom' });
    }
    return Object.assign(base, { trigger: container, start: 'top 80%', end: 'bottom 20%' });
  }

  // Rest before the bead has reached a step: dim, empty number slot, image
  // hidden and scaled down.
  function parkRest() {
    steps.forEach(function (s) {
      gsap.killTweensOf([s.el, s.media].concat(s.strips).filter(Boolean));
      gsap.set(s.el, { opacity: UPCOMING });
      if (s.media) gsap.set(s.media, { opacity: 0, scale: MEDIA_FROM, force3D: true });
      s.strips.forEach(function (strip, k) { gsap.set(strip, { yPercent: s.hidden[k] }); });
      s.tier = UPCOMING;
      s.shown = false;
      s.rolled = false;
    });
  }

  // Everything readable at once: the disabled-viewport state. The line is drawn
  // in full and the bead sits at its end.
  function showAll() {
    steps.forEach(function (s) {
      gsap.killTweensOf([s.el, s.media].concat(s.strips).filter(Boolean));
      gsap.set(s.el, { opacity: 1 });
      if (s.media) gsap.set(s.media, { opacity: 1, scale: 1 });
      s.strips.forEach(function (strip, k) { gsap.set(strip, { yPercent: s.targets[k] }); });
      s.tier = 1;
      s.shown = true;
      s.rolled = true;
    });
    gsap.set(current!.path, { drawSVG: '0% 100%' });
    gsap.set(bead, { x: current!.end!.x, y: current!.end!.y, xPercent: -50, yPercent: -50 });
  }

  // One scrubbed timeline. The bead's leg is a single explicit 0 -> 1 path
  // tween and the line draws 0% -> 100% over the same span, so the bead is
  // always the end of the line and each step's label sits exactly where the
  // bead reaches its anchor.
  function buildTimeline() {
    const path = current!.path;
    const t = gsap.timeline({
      defaults: { ease: EASE, force3D: true },
      scrollTrigger: makeTrigger(),
    });

    t.to(bead, {
      motionPath: { path: path, align: path, alignOrigin: [0.5, 0.5], autoRotate: false, start: 0, end: 1 },
      ease: 'none',
      duration: 1,
      // render the start now, so the bead sits on the line before any scroll
      immediateRender: true,
    }, 0);

    t.fromTo(path,
      { drawSVG: '0% 0%' },
      {
        drawSVG: '0% 100%',
        ease: 'none',
        force3D: false,
        duration: 1,
      }, 0);

    // step arrivals are not on this timeline: onUpdate -> setActive plays them
    steps.forEach(function (s, i) {
      t.addLabel('step' + (i + 1), anchorAt(i));
    });

    return t;
  }

  // Reduced motion: no travel, no tweens. The scrub still jumps the bead to
  // the step it has reached with the line drawn up to it, and each step's
  // card, image and number switch without moving.
  function buildReduced() {
    const cur = current!;
    const t = gsap.timeline({ scrollTrigger: makeTrigger() });
    steps.forEach(function (s, i) {
      const at = anchorAt(i);
      const when = i === 0 ? 0 : at;
      t.set(cur.path, { drawSVG: '0% ' + at * 100 + '%' }, when);
      t.set(bead, {
        x: function () { return cur.pts[i].x; },
        y: function () { return cur.pts[i].y; },
        xPercent: -50, yPercent: -50,
      }, when);
    });
    return t;
  }

  // --- 7. Event listeners ---
  function onClick(e: MouseEvent) {
    const li = (e.target as Element).closest<HTMLElement>('[data-anm-prl-step]');
    if (!li || !container.contains(li)) return;
    scrollToStep(stepEls.indexOf(li));
  }

  function relayout() {
    layout();
    ScrollTrigger.refresh();
  }

  // Lay out again once ScrollTrigger's refresh is done (sizes are final then).
  function onRefreshed() {
    if (current) layout();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 150);
  }

  container.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  ScrollTrigger.addEventListener('refresh', onRefreshed);
  let killed = false;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!killed) relayout(); });

  // --- 8. Initial DOM state ---
  stepEls.forEach(function (el) {
    const numHost = el.querySelector<HTMLElement>('[data-anm-prl-num]');
    const numText = numHost ? numHost.textContent || '' : '';
    const cols = numHost ? buildColumns(numHost) : { strips: [], hidden: [], targets: [] };
    steps.push({
      el: el,
      btn: el.querySelector('button') || el,
      num: numHost,
      media: el.querySelector<HTMLElement>('[data-anm-prl-media]'),
      numText: numText,
      tier: 0, shown: false, rolled: false,
      strips: cols.strips,
      hidden: cols.hidden,
      targets: cols.targets,
    });
  });
  paths.forEach(ghostOf);
  container.style.setProperty('--prl-bead', beadSize + 'px');

  // --- 9. Reduced motion ---
  // Mobile/desktop, reduced-motion and the disable-viewport list are tiled
  // into ONE matchMedia call, so any change tears down the previous build
  // (GSAP reverts the last callback's return value) before rebuilding.
  const conditions: Record<string, string> = {
    isMobile: '(max-width: 767px)',
    isDesktop: '(min-width: 768px)',
    isReduced: '(prefers-reduced-motion: reduce)',
    isFull: '(prefers-reduced-motion: no-preference)',
  };
  const disableQuery = disableList.map(function (k) { return BREAKPOINTS[k]; }).filter(Boolean).join(', ');
  if (disableQuery) conditions.isDisabledViewport = disableQuery;

  mm.add(conditions, function (context) {
    const c = context.conditions!;
    const isMobile = !!c.isMobile;
    const disabled = !!c.isDisabledViewport;
    reduced = !!c.isReduced;

    current = { isMobile: isMobile, path: pathFor(isMobile), pts: [], anchors: null, start: null, end: null };
    // the track only grows tall where the stage sticks
    container.style.setProperty('--prl-track', !isMobile && sticky ? (100 + TRACK_VH) + 'vh' : 'auto');
    layout();

    if (disabled) {
      showAll();
    } else if (reduced) {
      parkRest();
      tl = buildReduced();
    } else {
      parkRest();
      tl = buildTimeline();
    }

    return function () {
      if (tl) {
        if (tl.scrollTrigger) tl.scrollTrigger.kill(true);
        tl.kill();
        tl = null;
      }
      gsap.set(bead, { clearProps: 'transform' });
      paths.forEach(function (p) { gsap.set(p, { clearProps: 'strokeDasharray,strokeDashoffset' }); });
      clearActive();
      current = null;
    };
  });

  // --- 10. Public API ---
  return {
    refresh: relayout,
    scrollTo: scrollToStep,
    kill: function () {
      killed = true;
      clearTimeout(resizeTimer);
      container.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      ScrollTrigger.removeEventListener('refresh', onRefreshed);
      mm.revert();
      // Devolve o markup original: números como texto, sem as linhas-fantasma.
      ghosts.forEach(function (g) { g.remove(); });
      steps.forEach(function (s) {
        if (s.num) s.num.textContent = s.numText;
        gsap.set([s.el, s.media].filter(Boolean), { clearProps: 'opacity,transform' });
      });
      container.style.removeProperty('--prl-bead');
      container.style.removeProperty('--prl-track');
    },
  };
}
