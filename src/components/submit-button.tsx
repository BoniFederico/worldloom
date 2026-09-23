'use client';

import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

type Props = Omit<ComponentProps<'button'>, 'type' | 'disabled'>;

/** Bottone di submit con spinner inline durante l'invio (D-052): disabilitato, testo invariato. */
export function SubmitButton({ children, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
