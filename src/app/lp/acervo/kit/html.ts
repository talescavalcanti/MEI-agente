// Escapa texto para dangerouslySetInnerHTML (camadas que o GSAP reescreve por innerHTML).
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
