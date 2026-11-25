export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`The page is missing #${id}.`);
  return found as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
