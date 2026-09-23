import { Monitor, Moon, Sun } from 'lucide-react';
import { setTheme } from '@/app/actions';
import type { Theme } from '@/i18n/preferences';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'];
const ICON: Record<Theme, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] as Theme;
}

type Props = {
  current: Theme;
  currentLabel: string;
  nextLabel: string;
};

/** Un solo bottone che cicla sistema → chiaro → scuro → sistema (D-052), invece del gruppo testuale precedente. */
export function ThemeToggle({ current, currentLabel, nextLabel }: Props) {
  const Icon = ICON[current];
  const description = `${currentLabel} → ${nextLabel}`;
  return (
    <form action={setTheme}>
      <input type="hidden" name="value" value={nextTheme(current)} />
      <button type="submit" className="icon-btn" aria-label={description} title={description}>
        <Icon size={20} aria-hidden="true" />
      </button>
    </form>
  );
}
