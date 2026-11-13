import { PRIVATE_HEADERS, requireUserApi } from "@/lib/auth/dal";
import { meiDoUsuario, rpcDb } from "@/lib/dominio/mei";
import type { Cliente, Contrato, ItemVisto } from "@/lib/dominio/tipos";
import { gerarContratoPdf, nomeArquivoContrato } from "@/lib/documentos/contrato-pdf";
import { ymdSP } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const naoEncontrado = () =>
  Response.json({ error: "Contrato não encontrado." }, { status: 404, headers: PRIVATE_HEADERS });

/**
 * Contrato em PDF para baixar. Exige sessão e MEI; o contrato vem do
 * `item_ver` do próprio MEI, então id de outro negócio dá 404 como id
 * inexistente. O CPF/CNPJ do cliente sai do cadastro (`cliente_listar`),
 * achado pelo serviço do contrato.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;
  const mei = await meiDoUsuario(rpcDb, auth.user.id);
  if (!mei) return naoEncontrado();

  const { id } = await params;
  if (!UUID.test(id)) return naoEncontrado();

  let visto: ItemVisto;
  try {
    visto = (await rpcDb("item_ver", { p_mei: mei.id, p_tipo: "contrato", p_id: id })) as ItemVisto;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("regra: item não encontrado")) return naoEncontrado();
    throw e;
  }
  if (!visto.servico || !visto.cliente) return naoEncontrado();
  const contrato = visto.item as Contrato;

  const [servicos, clientes] = await Promise.all([
    rpcDb("servico_listar", { p_mei: mei.id }) as Promise<{ id: string; cliente_id: string }[]>,
    rpcDb("cliente_listar", { p_mei: mei.id }) as Promise<Cliente[]>,
  ]);
  const clienteId = servicos.find((s) => s.id === contrato.servico_id)?.cliente_id;
  const documento = clientes.find((c) => c.id === clienteId)?.documento ?? null;

  const aprovado = contrato.status === "aprovado";
  const bytes = await gerarContratoPdf({
    mei: { ...visto.mei, cnpj: mei.cnpj },
    cliente: { ...visto.cliente, documento },
    servico: visto.servico,
    orcamento: visto.orcamento,
    minuta: contrato.minuta,
    aprovado,
    data: aprovado && contrato.aprovado_em ? ymdSP(new Date(contrato.aprovado_em)) : null,
  });

  const nome = nomeArquivoContrato(visto.servico.numero, visto.cliente.nome);
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
