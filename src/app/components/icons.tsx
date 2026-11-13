/**
 * Ícones do painel, desenhados à mão em vez de vir de biblioteca: são poucos e
 * todos seguem a regra da §7.12 — grade 24×24, traço 1.7, pontas e junções
 * redondas, cor por `currentColor`. Decorativos (`aria-hidden`): quem dá o
 * nome é o texto ao lado.
 */
function Icon({ children, className = "h-[1.15rem] w-[1.15rem]" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const IconGrid = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </Icon>
);

export const IconBolt = (p: P) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
  </Icon>
);

export const IconChart = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-4" />
    <path d="M12 16V7" />
    <path d="M17 16v-6" />
  </Icon>
);

export const IconUsers = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
    <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" />
    <path d="M17.5 14.9c1.6.6 2.7 2.2 3 4.6" />
  </Icon>
);

export const IconUser = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
  </Icon>
);

export const IconLogout = (p: P) => (
  <Icon {...p}>
    <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
    <path d="M10 8 6 12l4 4" />
    <path d="M6 12h9" />
  </Icon>
);

export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h10" />
  </Icon>
);

export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="m6 6 12 12" />
    <path d="M18 6 6 18" />
  </Icon>
);

export const IconChevrons = (p: P) => (
  <Icon {...p}>
    <path d="m8 9 4-4 4 4" />
    <path d="m8 15 4 4 4-4" />
  </Icon>
);

export const IconSend = (p: P) => (
  <Icon {...p}>
    <path d="M20.5 3.5 10 14" />
    <path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" />
  </Icon>
);

export const IconLink = (p: P) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const IconClick = (p: P) => (
  <Icon {...p}>
    <path d="m9 9 11 4-4.5 1.5L14 19 9 9Z" />
    <path d="M5.5 5.5 4 4" />
    <path d="M9 4V2.5" />
    <path d="M4 9H2.5" />
  </Icon>
);

export const IconUserPlus = (p: P) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3 20c.8-3.6 3.6-5.6 7-5.6 1.4 0 2.7.3 3.8 1" />
    <path d="M18 14v6" />
    <path d="M15 17h6" />
  </Icon>
);

export const IconPulse = (p: P) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);

export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

/* Menu do painel. Mesma grade e traço dos de cima. */

export const IconHome = (p: P) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9v9.5A1.5 1.5 0 0 0 7.5 20H10v-5.5h4V20h2.5a1.5 1.5 0 0 0 1.5-1.5V9" />
  </Icon>
);

export const IconCalendar = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </Icon>
);

export const IconBulb = (p: P) => (
  <Icon {...p}>
    <path d="M9 17.5h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17.5h5.2V15.8c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
  </Icon>
);

export const IconLayers = (p: P) => (
  <Icon {...p}>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16 8.5 4.5 8.5-4.5" />
  </Icon>
);

export const IconPlay = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <path d="M10 8.8v6.4l5.2-3.2L10 8.8Z" />
  </Icon>
);

export const IconBookmark = (p: P) => (
  <Icon {...p}>
    <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V20.5L12 16.5l-5.5 4V4.5Z" />
  </Icon>
);

export const IconImage = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="3.5" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="m4 17 4.5-4.5 3.5 3.5 3-3 5 5" />
  </Icon>
);

export const IconTrend = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="m5 15 4.5-4.5 3.5 3 6-6.5" />
    <path d="M15 7h4v4" />
  </Icon>
);

export const IconPalette = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.8 16.7 3.5 12 3.5Z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="10.5" cy="7.3" r="1" />
    <circle cx="15" cy="7.8" r="1" />
  </Icon>
);

export const IconChat = (p: P) => (
  <Icon {...p}>
    <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5Z" />
  </Icon>
);

export const IconRefresh = (p: P) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Icon>
);

export const IconSparkle = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5v4" />
    <path d="M12 16.5v4" />
    <path d="M3.5 12h4" />
    <path d="M16.5 12h4" />
    <path d="m6 6 2.6 2.6" />
    <path d="m15.4 15.4 2.6 2.6" />
    <path d="m18 6-2.6 2.6" />
    <path d="M8.6 15.4 6 18" />
  </Icon>
);

export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

export const IconChevronLeft = (p: P) => (
  <Icon {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const IconTrash = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" />
    <path d="M6.5 7l.8 11.3c.1 1 .9 1.7 1.9 1.7h5.6c1 0 1.8-.7 1.9-1.7L17.5 7" />
  </Icon>
);

/* Menu do MEIagente. */

export const IconTool = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-8.2 8.2a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1-1.9-1.9Z" />
    <path d="M14.5 6.5 17 4l3 3-2.5 2.5" />
  </Icon>
);

export const IconDoc = (p: P) => (
  <Icon {...p}>
    <path d="M7 3.5h7l4.5 4.5v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M13.5 3.5V8h5" />
    <path d="M9 12.5h6" />
    <path d="M9 16h4" />
  </Icon>
);

export const IconStore = (p: P) => (
  <Icon {...p}>
    <path d="M4 9.5 5.5 4.5h13L20 9.5" />
    <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
    <path d="M5.5 11.5v8h13v-8" />
    <path d="M10 19.5V15h4v4.5" />
  </Icon>
);
