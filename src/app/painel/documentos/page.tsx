import type { Metadata } from "next";
import Link from "next/link";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";

export const metadata: Metadata = { title: "Documentos" };
type DocumentoListado = { id: string; tipo: "orcamento" | "contrato"; status: string; numero: number; descricao: string; cliente_nome: string; valor: number | null; criado_em: string };

export default async function Documentos() {
  const { mei } = await requireMei();
  const documentos = await rpcDb("documentos_listar", { p_mei: mei.id }) as DocumentoListado[];
  if (!documentos.length) return <EmptyModule section="Documentos" title="Documentos" summary="Nenhum documento ainda. Peça um orçamento ou contrato ao agente." phase={null} phaseNote="Os documentos gerados vão aparecer aqui para consulta e impressão." items={["Orçamentos", "Minutas de contrato"]} />;
  return <div className="space-y-6"><PageHeader section="Documentos" title="Documentos" summary="Orçamentos e minutas gerados para seus clientes." />
    <ul className="grid gap-4 md:grid-cols-2">{documentos.map(d => <li key={`${d.tipo}-${d.id}`} className="card space-y-3">
      <p className="eyebrow">{d.tipo === "orcamento" ? "Orçamento" : "Contrato"} · {d.status}</p>
      <h2 className="text-title-card">#{String(d.numero).padStart(3, "0")} · {d.descricao}</h2>
      <p className="text-body-sm text-muted">{d.cliente_nome}{d.valor == null ? "" : ` · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.valor)}`}</p>
      <Link className="text-link inline-block text-body-sm font-semibold text-brand-600" href={`/painel/documentos/${d.tipo}/${d.id}`}>Ver documento</Link>
    </li>)}</ul>
  </div>;
}
