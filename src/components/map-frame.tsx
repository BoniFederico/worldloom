'use client';

import { useState } from 'react';

type Props = {
  children: React.ReactNode;
  /** Se presente, un clic sulla mappa (non su un pin) riempie questi campi con la posizione in percentuale. */
  pick?: { xId: string; yId: string; label: string };
};

const round = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Contenitore della mappa. Per chi può scrivere, un clic sull'immagine imposta la posizione del nuovo pin nei campi
 * del modulo (che restano modificabili a mano: l'alternativa da tastiera). Senza JavaScript i campi si compilano a mano.
 */
export function MapFrame({ children, pick }: Props) {
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={pick ? 'map-frame map-frame-pick' : 'map-frame'}
      onClick={
        pick
          ? (event) => {
              if ((event.target as HTMLElement).closest('a')) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const x = Math.min(
                100,
                Math.max(0, ((event.clientX - rect.left) / rect.width) * 100),
              );
              const y = Math.min(
                100,
                Math.max(0, ((event.clientY - rect.top) / rect.height) * 100),
              );
              const setValue = (id: string, value: number) => {
                const input = document.getElementById(id);
                if (input instanceof HTMLInputElement) input.value = round(value);
              };
              setValue(pick.xId, x);
              setValue(pick.yId, y);
              setSpot({ x, y });
            }
          : undefined
      }
    >
      {children}
      {pick && spot ? (
        <span
          className="map-spot"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          role="img"
          aria-label={pick.label}
        />
      ) : null}
    </div>
  );
}
