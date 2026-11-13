// Junta classes ignorando valores falsy.
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
