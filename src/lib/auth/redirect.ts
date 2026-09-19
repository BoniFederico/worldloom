/** Consente solo redirect a percorsi interni: evita open redirect via `?next=`. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/';
  return value;
}
