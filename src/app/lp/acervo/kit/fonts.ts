// Componentes que medem linhas (split por palavra/linha) esperam as fontes carregarem.
export const fontsReady = (): Promise<unknown> =>
  typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
