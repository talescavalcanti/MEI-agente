"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Cartao as CartaoRef } from "@/lib/agente/ferramentas/executar";
import type { ItemStatus, NotaStatus } from "@/lib/dominio/tipos";
import { AuthError } from "../../components/AuthShell";
import Button from "../../components/Button";
import { decidirItem, decidirNota, marcarEnviada, prepararNota, registrarEmissao, verItem, verNota } from "./actions";
import type { CartaoDados, CartaoNotaDados, ResultadoCartao, ResultadoNota } from "./cartao-dados";
import EditarItem from "./EditarItem";

const STATUS: Record<ItemStatus, string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  descartado: "Descartado",
  enviado: "Enviada",
};

const TIPO: Record<CartaoRef["tipo"], string> = {
  orcamento: "Orçamento",
  contrato: "Contrato",
  mensagem: "Mensagem",
  nota: "Nota fiscal",
};

/** Cartão de item que esta tela já sabe mostrar (orçamento, minuta, mensagem). */
type CartaoItemRef = CartaoRef & { tipo: Exclude<CartaoRef["tipo"], "nota"> };

/**
 * Cartão de aprovação de um orçamento, minuta ou mensagem.
 *
 * Rascunho: [Aprovar] [Editar] [Descartar]. Mensagem aprovada: [Copiar]
 * [Abrir no WhatsApp] (só com whatsapp cadastrado) [Marcar como enviada].
 * Nada sai sozinho: o envio é sempre a pessoa, por fora.
 *
 * Sem `inicial`, busca o estado atual com `verItem` (cartão que acabou de
 * chegar pelo chat ou conversa recarregada). Toda ação devolve o cartão
 * relido do banco, e é ele que passa a valer.
 */
export default function Cartao({
  cartao,
  inicial,
}: {
  cartao: CartaoRef;
  inicial?: CartaoDados | CartaoNotaDados;
}) {
  if (cartao.tipo === "nota") {
    return <CartaoNota id={cartao.id} inicial={inicial?.tipo === "nota" ? inicial : undefined} />;
  }
  return (
    <CartaoItem cartao={cartao as CartaoItemRef} inicial={inicial && inicial.tipo !== "nota" ? inicial : undefined} />
  );
}

function CartaoItem({ cartao, inicial }: { cartao: CartaoItemRef; inicial?: CartaoDados }) {
  const [dados, setDados] = useState<CartaoDados | null>(inicial ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  function aplicar(r: ResultadoCartao) {
    if ("erro" in r) {
      setErro(r.erro);
    } else {
      setErro(null);
      setDados(r.cartao);
    }
  }

  useEffect(() => {
    if (inicial) return;
    startTransition(async () => aplicar(await verItem(cartao.tipo, cartao.id)));
  }, [cartao.tipo, cartao.id, inicial]);

  function agir(acao: () => Promise<ResultadoCartao>) {
    setAviso(null);
    startTransition(async () => aplicar(await acao()));
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Texto copiado.");
    } catch {
      setAviso("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }

  if (!dados) {
    return (
      <article className="card" aria-busy={pending}>
        <p className="text-body-sm text-muted">
          {erro ?? `Carregando ${TIPO[cartao.tipo].toLowerCase()}…`}
        </p>
      </article>
    );
  }

  const fechado = dados.status === "descartado" || dados.status === "enviado";

  return (
    <article className={`card space-y-4 ${fechado ? "opacity-70" : ""}`} aria-busy={pending}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted">{TIPO[dados.tipo]}</p>
          <h3 className="text-title-card font-semibold">{dados.titulo}</h3>
        </div>
        <span className="shrink-0 rounded-chip bg-tonal px-2.5 py-1 text-caption font-medium text-muted-on-tint">
          {STATUS[dados.status]}
        </span>
      </header>

      {dados.tipo === "orcamento" && (
        <div className="rounded-field bg-tonal p-4 text-body-sm">
          <ul className="space-y-1.5">
            {dados.orcamento.linhas.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{l.descricao}</span>
                <span className="shrink-0 tabular-nums">{l.valor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between gap-4 border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{dados.orcamento.total}</span>
          </p>
          <p className="mt-2 text-caption text-muted">
            {dados.orcamento.validade} · Pagamento: {dados.orcamento.pagamento}
          </p>
        </div>
      )}

      {dados.tipo === "contrato" && (
        <>
          <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
            {dados.aviso}
          </p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-field bg-tonal p-4 text-body-sm">
            {dados.texto}
          </p>
          <Link href={dados.documento} className="inline-block text-body-sm font-medium text-brand-500 hover:underline">
            Ver documento
          </Link>
        </>
      )}

      {dados.tipo === "mensagem" && (
        <>
          <p className="whitespace-pre-wrap rounded-field bg-tonal-blue p-4 text-body-sm">{dados.texto}</p>
          {dados.divergentes.length > 0 && (
            <p role="note" className="rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
              O texto cita {dados.divergentes.length === 1 ? "um valor diferente" : "valores diferentes"} do
              serviço{dados.valorServico ? ` (${dados.valorServico})` : ""}: {dados.divergentes.join(", ")}.
              Confira antes de aprovar.
            </p>
          )}
        </>
      )}

      {dados.status === "descartado" && <p className="text-body-sm text-muted">Descartado. Nada foi enviado.</p>}
      {dados.status === "enviado" && <p className="text-body-sm text-muted">Marcada como enviada.</p>}

      {erro && <AuthError>{erro}</AuthError>}
      {aviso && (
        <p role="status" className="text-body-sm text-muted">
          {aviso}
        </p>
      )}

      {dados.botoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dados.botoes.map((b) => {
            switch (b) {
              case "aprovar":
                return (
                  <Button key={b} size="compact" disabled={pending} onClick={() => agir(() => decidirItem(dados.tipo, dados.id, "aprovar"))}>
                    Aprovar
                  </Button>
                );
              case "editar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => setEditando(true)}>
                    Editar
                  </Secundario>
                );
              case "descartar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => agir(() => decidirItem(dados.tipo, dados.id, "descartar"))}>
                    Descartar
                  </Secundario>
                );
              case "copiar":
                return dados.tipo === "mensagem" ? (
                  <Button key={b} size="compact" onClick={() => copiar(dados.texto)}>
                    Copiar
                  </Button>
                ) : null;
              case "whatsapp": {
                if (dados.tipo !== "mensagem" || !dados.whatsapp) return null;
                const link = dados.whatsapp;
                return (
                  <Secundario key={b} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                    Abrir no WhatsApp
                  </Secundario>
                );
              }
              case "marcar_enviada":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => agir(() => marcarEnviada(dados.id))}>
                    Marcar como enviada
                  </Secundario>
                );
            }
          })}
        </div>
      )}

      {editando && (
        <EditarItem
          dados={dados}
          onClose={() => setEditando(false)}
          onSalvo={(novo) => {
            setDados(novo);
            setErro(null);
            setEditando(false);
          }}
        />
      )}
    </article>
  );
}

/** Ação secundária do cartão: bloco tonal, sem a seta do botão principal. */
function Secundario({
  children,
  onClick,
  disabled,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-field bg-field px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-field-hover disabled:opacity-55"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- nota fiscal

const STATUS_NOTA: Record<NotaStatus, string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovada",
  emitida: "Emitida",
  divergente: "Divergente",
  descartado: "Descartada",
  cancelada: "Cancelada",
};

/**
 * Cartão da nota fiscal. Rascunho: campos na ordem do Emissor Nacional, cada
 * um com [Copiar]; avisos em âmbar com "Conferi os avisos", que libera
 * [Aprovar]; [Descartar]. Aprovada ou divergente: [Abrir o Emissor Nacional]
 * e [Registrar emissão] (XML ou número e valor). Emitida: número e [Mandar
 * para o cliente]. O sistema não emite nada: quem emite é o MEI, no portal.
 */
function CartaoNota({ id, inicial }: { id: string; inicial?: CartaoNotaDados }) {
  const [dados, setDados] = useState<CartaoNotaDados | null>(inicial ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conferi, setConferi] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [pending, startTransition] = useTransition();

  function aplicar(r: ResultadoNota) {
    if ("erro" in r) {
      setErro(r.erro);
    } else {
      setErro(null);
      setDados(r.cartao);
      setRegistrando(false);
    }
  }

  useEffect(() => {
    if (inicial) return;
    startTransition(async () => aplicar(await verNota(id)));
  }, [id, inicial]);

  function agir(acao: () => Promise<ResultadoNota>) {
    setAviso(null);
    startTransition(async () => aplicar(await acao()));
  }

  async function copiar(rotulo: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(`${rotulo} copiado.`);
    } catch {
      setAviso("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }

  if (!dados) {
    return (
      <article className="card" aria-busy={pending}>
        <p className="text-body-sm text-muted">{erro ?? "Carregando nota fiscal…"}</p>
      </article>
    );
  }

  const fechado = dados.status === "descartado" || dados.status === "cancelada";
  const precisaConferir = dados.status === "rascunho" && dados.avisos.length > 0 && !dados.avisosConfirmados;

  return (
    <article className={`card space-y-4 ${fechado ? "opacity-70" : ""}`} aria-busy={pending}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted">Nota fiscal</p>
          <h3 className="text-title-card font-semibold">{dados.titulo}</h3>
        </div>
        <span
          className={`shrink-0 rounded-chip px-2.5 py-1 text-caption font-medium ${
            dados.status === "divergente" ? "bg-danger-bg text-danger-text" : "bg-tonal text-muted-on-tint"
          }`}
        >
          {STATUS_NOTA[dados.status]}
        </span>
      </header>

      <dl className="divide-y divide-line rounded-field bg-tonal text-body-sm">
        {dados.campos.map((c) => (
          <div key={c.rotulo} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <dt className="w-full text-caption text-muted sm:w-48">{c.rotulo}</dt>
            <dd className="min-w-0 flex-1 break-words">
              {c.valor}
              {c.observacao && (
                <span className="ml-2 rounded-chip bg-warn-bg px-2 py-0.5 text-caption text-warn-text">{c.observacao}</span>
              )}
            </dd>
            {dados.status !== "descartado" && (
              <button
                type="button"
                onClick={() => copiar(c.rotulo, c.copiar)}
                className="rounded-field px-2.5 py-1 text-caption font-medium text-brand-600 hover:bg-tonal-blue"
                aria-label={`Copiar ${c.rotulo}`}
              >
                Copiar
              </button>
            )}
          </div>
        ))}
      </dl>

      {dados.status === "rascunho" && dados.avisos.length > 0 && (
        <div role="note" className="space-y-3 rounded-field bg-warn-bg px-4 py-3 text-body-sm text-warn-text">
          <ul className="list-disc space-y-1 pl-5">
            {dados.avisos.map((a) => (
              <li key={a.codigo}>{a.texto}</li>
            ))}
          </ul>
          {!dados.avisosConfirmados && (
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
              Conferi os avisos
            </label>
          )}
        </div>
      )}

      {dados.status === "divergente" && (
        <div role="alert" className="space-y-3 rounded-field bg-danger-bg px-4 py-3 text-body-sm text-danger-text">
          <p className="font-medium">A nota emitida não bate com o rascunho.</p>
          {dados.diferencas.length > 0 && (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="py-1 pr-3 font-medium">Campo</th>
                  <th className="py-1 pr-3 font-medium">Esperado</th>
                  <th className="py-1 font-medium">Emitido</th>
                </tr>
              </thead>
              <tbody>
                {dados.diferencas.map((d) => (
                  <tr key={d.rotulo}>
                    <td className="py-1 pr-3">{d.rotulo}</td>
                    <td className="py-1 pr-3 tabular-nums">{d.esperado}</td>
                    <td className="py-1 tabular-nums">{d.emitido}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p>
            Cancele ou substitua a nota no Emissor Nacional dentro do prazo do seu município e registre de novo.
          </p>
        </div>
      )}

      {dados.status === "emitida" && (
        <p className="text-body-sm">
          NFS-e nº <strong>{dados.numeroNfse}</strong>
          {dados.emitidaEm ? `, registrada em ${dados.emitidaEm}` : ""}.
        </p>
      )}
      {dados.status === "descartado" && <p className="text-body-sm text-muted">Descartada. Nada foi emitido.</p>}

      {erro && <AuthError>{erro}</AuthError>}
      {aviso && (
        <p role="status" className="text-body-sm text-muted">
          {aviso}
        </p>
      )}

      {dados.botoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dados.botoes.map((b) => {
            switch (b) {
              case "aprovar":
                return (
                  <Button
                    key={b}
                    size="compact"
                    disabled={pending || (precisaConferir && !conferi)}
                    onClick={() => agir(() => decidirNota(dados.id, "aprovar", dados.avisosConfirmados || conferi))}
                  >
                    Aprovar
                  </Button>
                );
              case "descartar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => agir(() => decidirNota(dados.id, "descartar", false))}>
                    Descartar
                  </Secundario>
                );
              case "emissor":
                return (
                  <a
                    key={b}
                    href={dados.emissorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-field bg-field px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-field-hover"
                  >
                    Abrir o Emissor Nacional
                  </a>
                );
              case "registrar":
                return (
                  <Secundario key={b} disabled={pending} onClick={() => setRegistrando((v) => !v)}>
                    Registrar emissão
                  </Secundario>
                );
              case "mandar":
                return dados.pedidoEnvio ? (
                  <Button key={b} size="compact" href={dados.pedidoEnvio}>
                    Mandar para o cliente
                  </Button>
                ) : null;
            }
          })}
        </div>
      )}

      {registrando && (
        <form
          className="space-y-4 rounded-field bg-tonal p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            agir(() => registrarEmissao(dados.id, fd));
          }}
        >
          <label className="block">
            <span className="field-label">XML da nota emitida (até 200 KB)</span>
            <input name="xml" type="file" accept=".xml,text/xml,application/xml" className="field" />
          </label>
          <p className="text-caption text-muted">Ou, sem o arquivo, digite o número e o valor da nota:</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Número da NFS-e</span>
              <input name="numero" inputMode="numeric" autoComplete="off" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Valor da nota</span>
              <input name="valor" inputMode="decimal" autoComplete="off" placeholder="800,00" className="field" />
            </label>
          </div>
          <Button type="submit" size="compact" disabled={pending}>
            {pending ? "Conferindo…" : "Conferir e registrar"}
          </Button>
        </form>
      )}
    </article>
  );
}

/** [Preparar nota] da lista "Notas a emitir": prepara e mostra o cartão logo abaixo. */
export function PrepararNota({ servicoId }: { servicoId: string }) {
  const [resultado, setResultado] = useState<ResultadoNota | null>(null);
  const [pending, startTransition] = useTransition();

  if (resultado && "cartao" in resultado) return <CartaoNota id={resultado.cartao.id} inicial={resultado.cartao} />;

  return (
    <div className="space-y-2">
      <Button
        size="compact"
        disabled={pending}
        onClick={() => startTransition(async () => setResultado(await prepararNota(servicoId)))}
      >
        {pending ? "Preparando…" : "Preparar nota"}
      </Button>
      {resultado && "erro" in resultado && <AuthError>{resultado.erro}</AuthError>}
    </div>
  );
}
