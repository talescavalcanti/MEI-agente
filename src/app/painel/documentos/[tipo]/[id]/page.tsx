import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { ItemVisto, Orcamento, Contrato } from "@/lib/dominio/tipos";
import { renderOrcamento } from "@/lib/documentos/orcamento";
import { AVISO_MINUTA } from "@/lib/documentos/contrato";
import PageHeader from "../../../PageHeader";

export const metadata: Metadata = { title: "Ver documento" };
type Props = { params: Promise<{ tipo: string; id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VerDocumento({ params }: Props) {
  const { mei } = await requireMei();
  const { tipo, id } = await params;
  if ((tipo !== "orcamento" && tipo !== "contrato") || !UUID.test(id)) notFound();
  let visto: ItemVisto;
  try { visto = await rpcDb("item_ver", { p_mei: mei.id, p_tipo: tipo, p_id: id }) as ItemVisto; }
  catch (e) { if (e instanceof Error && e.message.startsWith("regra: item não encontrado")) notFound(); throw e; }
  if (!visto.servico || !visto.cliente) notFound();
  const dados = { mei: visto.mei, cliente: visto.cliente, servico: visto.servico, orcamento: visto.orcamento };
  const orc = tipo === "orcamento" ? renderOrcamento(dados) : null;
  const minuta = tipo === "contrato" ? (visto.item as Contrato).minuta : null;
  return <div className="space-y-6 print-document">
    <div className="print:hidden"><PageHeader section="Documentos" title={tipo === "orcamento" ? "Orçamento" : "Contrato"} actions={<Link href="/painel/documentos" className="text-link text-brand-600">Voltar aos documentos</Link>} /></div>
    <article className="card mx-auto max-w-3xl space-y-6 bg-white p-6 text-slate-900 print:shadow-none print:p-0 sm:p-10">
      <div className="flex justify-between gap-4 border-b border-line pb-5"><strong className="font-heading text-title-dialog">{visto.mei.nome}</strong><span className="text-body-sm text-muted">{tipo === "orcamento" ? `Orçamento nº ${(visto.item as Orcamento).numero}` : "Minuta de contrato"}</span></div>
      {orc ? <><h2 className="text-title-dialog">{orc.titulo}</h2><p className="text-body">Cliente: {visto.cliente.nome}</p><div className="space-y-2">{orc.linhas.map((linha, i) => <div key={i} className="flex justify-between gap-4 border-b border-line py-2 text-body"><span>{linha.descricao}</span><span>{linha.valor}</span></div>)}</div><p className="text-right text-title-card">Total: {orc.total}</p><p className="text-body-sm">{orc.validade} · Pagamento: {orc.pagamento}</p></> : <><p className="rounded-field bg-amber-50 p-3 text-body-sm text-warn-text">{AVISO_MINUTA}</p><div className="whitespace-pre-wrap text-body leading-relaxed">{minuta}</div></>}
    </article>
    {tipo === "contrato" ? <div className="print:hidden flex flex-wrap gap-3">
      <a href={`/painel/documentos/contrato/${id}/pdf`} download className="rounded-field bg-brand-500 px-5 py-3 text-body font-semibold text-white">Baixar PDF</a>
      <button type="button" id="imprimir-documento" className="rounded-field border border-line bg-white px-5 py-3 text-body font-semibold text-slate-700">Imprimir</button>
    </div> : <button type="button" id="imprimir-documento" className="print:hidden rounded-field bg-brand-500 px-5 py-3 text-body font-semibold text-white">Imprimir / salvar PDF</button>}
    <script dangerouslySetInnerHTML={{ __html: "document.getElementById('imprimir-documento')?.addEventListener('click', () => window.print())" }} />
    <style>{`@media print { body:has(.print-document) aside, body:has(.print-document) header, body:has(.print-document) nav { display: none !important; } body:has(.print-document) main { margin: 0 !important; padding: 0 !important; max-width: none !important; } body:has(.print-document) { background: white !important; } }`}</style>
  </div>;
}
