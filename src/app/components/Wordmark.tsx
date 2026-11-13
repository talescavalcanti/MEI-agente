/**
 * A marca em texto: "MEIagente" em Fustat e o quadrado azul no lugar do ponto
 * final (estilo em `.wordmark`, globals.css). Tamanho vem de fora, por
 * `className`; o quadrado acompanha porque é medido em `em`.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      MEIagente
      <span aria-hidden="true" className="wordmark__dot" />
    </span>
  );
}
