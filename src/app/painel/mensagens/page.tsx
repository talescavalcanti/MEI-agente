import type { Metadata } from "next";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";

export const metadata: Metadata = { title: "Mensagens" };
type MensagemListada = { id: string; canal: string; objetivo: string; conteudo: string; status: string; cliente_nome: string | null; criado_em: string };

export default async function Mensagens() {
  const { mei } = await requireMei();
  const mensagens = await rpcDb("mensagens_listar", { p_mei: mei.id }) as MensagemListada[];
  if (!mensagens.length) return <EmptyModule section="Mensagens" title="Mensagens" summary="Nenhuma mensagem ainda. Peça ao agente um rascunho para seu cliente." phase={null} phaseNote="Os rascunhos e as mensagens aprovadas aparecem aqui." items={["Rascunhos de WhatsApp", "Sugestões de posts"]} />;
  return <div className="space-y-6"><PageHeader section="Mensagens" title="Mensagens" summary="Rascunhos e mensagens para consultar. A aprovação fica no agente." />
    <ul className="space-y-4">{mensagens.map(m => <li key={m.id} className="card space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-title-card">{m.cliente_nome ?? (m.canal === "instagram" ? "Post" : "Mensagem sem cliente")}</h2><span className="text-caption text-brand-600">{m.status}</span></div>
      <p className="text-caption text-muted">{m.canal === "whatsapp" ? "WhatsApp" : "Instagram"} · {m.objetivo.replaceAll("_", " ")}</p>
      <p className="dm-bubble whitespace-pre-wrap px-4 py-3 text-body text-slate-800">{m.conteudo}</p>
    </li>)}</ul>
  </div>;
}
