'use client';

import { useState, type DragEvent, type ReactNode } from 'react';

/**
 * Trascinamento delle card tra colonne, come aggiunta al modulo «Sposta in»: alla consegna imposta la destinazione nel
 * modulo della card e lo invia. Da tastiera e con lettori di schermo si usa il modulo, che resta sempre disponibile.
 */
export function KanbanDnd({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [over, setOver] = useState<string | null>(null);
  if (!enabled) return <div>{children}</div>;

  const columnOf = (e: DragEvent) =>
    (e.target as HTMLElement).closest<HTMLElement>('[data-column]');
  const cardOf = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('[data-card]');

  return (
    <div
      data-over={over ?? undefined}
      onDragStart={(e) => {
        const card = cardOf(e);
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.dataset.card ?? '');
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        const column = columnOf(e);
        if (!column) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(column.dataset.column ?? '');
      }}
      onDragEnd={() => setOver(null)}
      onDrop={(e) => {
        setOver(null);
        const column = columnOf(e);
        if (!column) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        const form = document.querySelector<HTMLFormElement>(`form[data-move="${CSS.escape(id)}"]`);
        const select = form?.elements.namedItem('to');
        if (!form || !(select instanceof HTMLSelectElement)) return;
        const target = column.dataset.column ?? '';
        if (select.value === target) return;
        if (![...select.options].some((o) => o.value === target && !o.disabled)) return;
        select.value = target;
        form.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
