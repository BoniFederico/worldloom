import { Globe } from 'lucide-react';
import { setLocale } from '@/app/actions';
import type { Locale } from '@/i18n/preferences';

type Props = {
  current: Locale;
  label: string;
  options: { value: Locale; label: string }[];
};

/** Icona globo che apre un piccolo menu con le due lingue (D-052), invece del gruppo testuale precedente. */
export function LanguageMenu({ current, label, options }: Props) {
  return (
    <details className="menu">
      <summary className="icon-btn" role="button" aria-label={label} title={label}>
        <Globe size={20} aria-hidden="true" />
      </summary>
      <form action={setLocale} className="menu-panel" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="submit"
            name="value"
            value={o.value}
            aria-pressed={o.value === current}
            className="menu-item"
          >
            {o.label}
          </button>
        ))}
      </form>
    </details>
  );
}
