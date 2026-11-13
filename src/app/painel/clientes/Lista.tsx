import type { Cliente } from "@/lib/dominio/tipos";

/** A grade simples de antes, como visão alternativa ao quadro (`?visao=lista`). */
export default function Lista({ clientes }: { clientes: Cliente[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {clientes.map((c) => (
        <li key={c.id} className="card space-y-3">
          <h2 className="text-title-card break-words">{c.nome}</h2>
          <p className="text-body-sm text-muted">{c.whatsapp ?? "WhatsApp não informado"}</p>
          {c.endereco && <p className="break-words text-body-sm text-slate-700">{c.endereco}</p>}
          {c.observacoes && <p className="break-words text-body-sm text-muted">{c.observacoes}</p>}
        </li>
      ))}
    </ul>
  );
}
