import type { Metadata } from "next";
import Link from "next/link";
import { requireMei, rpcDb } from "@/lib/dominio/mei";
import type { Cliente, ServicoListado } from "@/lib/dominio/tipos";
import Segmented from "@/app/components/Segmented";
import PageHeader from "../PageHeader";
import EmptyModule from "../EmptyModule";
import Quadro from "./Quadro";
import Lista from "./Lista";
import { filtrarPorNome, montarQuadro } from "./pipeline";

export const metadata: Metadata = { title: "Clientes" };

type Visao = "quadro" | "lista";
type Busca = { q?: string | string[]; visao?: string | string[] };

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function href(visao: Visao, q: string) {
  const p = new URLSearchParams();
  if (visao === "lista") p.set("visao", "lista");
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/painel/clientes?${s}` : "/painel/clientes";
}

export default async function Clientes({ searchParams }: { searchParams: Promise<Busca> }) {
  const { mei } = await requireMei();
  const params = await searchParams;
  const q = primeiro(params.q).trim().slice(0, 80);
  const visao: Visao = primeiro(params.visao) === "lista" ? "lista" : "quadro";

  const [clientes, servicos] = await Promise.all([
    rpcDb("cliente_listar", { p_mei: mei.id }) as Promise<Cliente[]>,
    rpcDb("servico_listar", { p_mei: mei.id, p_status: null }) as Promise<ServicoListado[]>,
  ]);
  if (!clientes.length) return <EmptyModule section="Clientes" title="Clientes" summary="Nenhum cliente ainda. Conte um serviço ao agente e ele cadastra para você." phase={null} phaseNote="Os clientes aparecem aqui assim que o agente os cadastrar." items={["Nome e contato de cada cliente", "Endereço e observações para atender melhor"]} />;

  const encontrados = filtrarPorNome(clientes, q);
  const resumo = `${clientes.length} ${clientes.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}. A etapa de cada um acompanha os serviços dele.`;

  return <div className="space-y-6">
    <PageHeader section="Clientes" title="Clientes" summary={resumo} actions={<Link className="text-link text-brand-600" href="/painel/agente">Falar com o agente</Link>} />

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form method="get" action="/painel/clientes" role="search" className="flex w-full gap-2 sm:max-w-sm">
        {visao === "lista" && <input type="hidden" name="visao" value="lista" />}
        <label htmlFor="busca-cliente" className="sr-only">Buscar cliente por nome</label>
        <input id="busca-cliente" name="q" type="search" defaultValue={q} placeholder="Buscar por nome" autoComplete="off" maxLength={80} className="field min-w-0 flex-1" />
        <button type="submit" className="shrink-0 rounded-field bg-brand-500 px-4 text-body-sm font-semibold text-white hover:bg-brand-600">Buscar</button>
      </form>
      <Segmented label="Visão dos clientes" current={visao} items={[
        { key: "quadro", label: "Quadro", href: href("quadro", q) },
        { key: "lista", label: "Lista", href: href("lista", q) },
      ]} />
    </div>

    {q && <p className="text-body-sm text-muted-on-tint">
      {encontrados.length ? `${encontrados.length} ${encontrados.length === 1 ? "cliente encontrado" : "clientes encontrados"} para "${q}".` : `Nenhum cliente com "${q}" no nome.`}{" "}
      <Link className="text-link text-brand-600" href={href(visao, "")}>Limpar busca</Link>
    </p>}

    {encontrados.length > 0 && (visao === "lista" ? <Lista clientes={encontrados} /> : <Quadro colunas={montarQuadro(encontrados, servicos)} />)}
  </div>;
}
