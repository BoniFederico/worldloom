'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TAB_ICON } from './route-tabs';
import { useTabBar } from './tab-bar-context';

/** Barra di schede in stile IDE (D-052, #112): sostituisce la navigazione a pagina singola fra le sezioni di un mondo. */
export function TabBar() {
  const t = useTranslations('Tabs');
  const ctx = useTabBar();
  if (!ctx || ctx.tabs.length === 0) return null;
  const { tabs, activePath, close } = ctx;

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

  return (
    <nav aria-label={t('barLabel')} className="tab-bar">
      <ul className="tab-bar-list">
        {tabs.map((tab) => {
          const Icon = TAB_ICON[tab.key];
          const active = tab.path === activePath;
          const label = tab.label ?? t(tab.key);
          return (
            <li key={tab.path} className={active ? 'tab tab-active' : 'tab'}>
              <Link
                href={tab.path}
                aria-current={active ? 'page' : undefined}
                className="tab-link"
                onAuxClick={(e) => {
                  // Il tasto centrale del mouse chiude la scheda invece di aprire il link in una nuova scheda del browser.
                  if (e.button === 1) {
                    e.preventDefault();
                    close(tab.path);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Delete' || e.key === 'Backspace') close(tab.path);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="tab-label">{label}</span>
              </Link>
              <button
                type="button"
                className="tab-close"
                aria-label={t('close', { label })}
                onClick={() => close(tab.path)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="tab-new" onClick={openPalette} aria-label={t('newTab')}>
        +
      </button>
    </nav>
  );
}
