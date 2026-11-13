import type { Metadata } from "next";
import Link from "next/link";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { Cliente } from "@/lib/dominio/tipos";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes() {
  const { mei } = await requireMei();
  const clientes = await rpcDb("cliente_listar", { p_mei: mei.id }) as Cliente[];
  if (!clientes.length) return <EmptyModule section="Clientes" title="Clientes" summary="Nenhum cliente ainda. Conte um serviço ao agente e ele cadastra para você." phase={null} phaseNote="Os clientes aparecem aqui assim que o agente os cadastrar." items={["Nome e contato de cada cliente", "Endereço e observações para atender melhor"]} />;
  return <div className="space-y-6">
    <PageHeader section="Clientes" title="Clientes" summary={`${clientes.length} ${clientes.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}.`} actions={<Link className="text-link text-brand-600" href="/painel/agente">Falar com o agente</Link>} />
    <ul className="grid gap-4 md:grid-cols-2">
      {clientes.map(c => <li key={c.id} className="card space-y-3">
        <h2 className="text-title-card">{c.nome}</h2>
        <p className="text-body-sm text-muted">{c.whatsapp ?? "WhatsApp não informado"}</p>
        {c.endereco && <p className="text-body-sm text-slate-700">{c.endereco}</p>}
        {c.observacoes && <p className="text-body-sm text-muted">{c.observacoes}</p>}
      </li>)}
    </ul>
  </div>;
}
