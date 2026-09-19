/**
 * Consente solo redirect a percorsi interni: evita open redirect via `?next=`.
 * Il browser elimina tab e newline dagli URL, quindi `/\t/evil.test` diventerebbe `//evil.test`:
 * si rifiutano i caratteri di controllo e le forme percent-encoded di `/` e `\`.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%(2f|5c)/i.test(value)) return '/';
  return value;
}
