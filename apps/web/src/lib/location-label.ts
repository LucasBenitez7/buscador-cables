/** What «Copiar» and «Imprimir» give for a location (fase 15): its code and its name. */
export function locationLabel(node: { code: string; name: string }): string {
  return `${node.code} ${node.name}`;
}
