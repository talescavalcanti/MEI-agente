/**
 * Iniciais de uma pessoa (usuário, cliente) num círculo. Sem foto: o MVP não
 * guarda imagem de ninguém, e as iniciais bastam para reconhecer a linha.
 * Decorativo (`aria-hidden`): o nome está escrito ao lado.
 */
export default function Avatar({
  name,
  size = "md",
}: {
  name: string | null;
  /** `sm` (36px) na sidebar; `md` (48px) no resto. */
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  return (
    <div
      aria-hidden="true"
      className={`grid ${box} shrink-0 place-items-center rounded-full bg-tonal-blue text-body-sm text-slate-500`}
    >
      {initials(name)}
    </div>
  );
}

/** "Maria Souza" → "MS"; "maria" → "MA"; vazio → "?". */
export function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
