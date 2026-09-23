'use client';

import { useRegisterTabLabel } from './tab-bar-context';

/** Da rendere in una pagina server component per dare alla sua scheda un'etichetta specifica (D-052, #112). */
export function TabLabel({ label }: { label: string }) {
  useRegisterTabLabel(label);
  return null;
}
