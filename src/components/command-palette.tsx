'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  quickSearch,
  type QuickResult,
  type QuickSearchResponse,
} from '@/app/worlds/[worldId]/search/actions';
import { splitExcerpt } from '@/lib/search/params';

const DEBOUNCE_MS = 120;

/**
 * Comando rapido di ricerca (Ctrl/Cmd+K, o il pulsante): una finestra modale nativa (<dialog>: focus intrappolato e Esc
 * gratis) con un campo combobox e i risultati. Invio apre lo snippet scelto; l'ultima voce porta alla ricerca completa.
 */
export function CommandPalette({ worldId }: { worldId: string }) {
  const t = useTranslations('Palette');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const listId = useId();

  const open = useCallback(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Ricerca con un breve ritardo; una risposta arrivata in ritardo non sovrascrive una più recente.
  useEffect(() => {
    // Anche con il campo vuoto: una risposta in volo non deve riapparire con la query successiva.
    const id = ++request.current;
    if (!query.trim()) return;
    const timer = setTimeout(async () => {
      const response = await quickSearch({ world: worldId, query }).catch(
        (): QuickSearchResponse => ({ ok: false }),
      );
      if (id !== request.current) return;
      setFailed(!response.ok);
      setResults(response.ok ? response.results : []);
      setActive(0);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, worldId]);

  const shown = query.trim() && !loading ? results : [];
  // Ultima voce: apre la ricerca completa con lo stesso testo.
  const total = shown.length + 1;
  const advanced = `/worlds/${worldId}/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;

  const choose = (index: number) => {
    const target = shown[index];
    close();
    router.push(target ? `/worlds/${worldId}/snippets/${target.id}` : advanced);
  };

  return (
    <>
      <button
        type="button"
        className="btn palette-trigger"
        onClick={open}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search size={18} aria-hidden="true" />
        <span>{t('open')}</span>
        <kbd aria-hidden="true">Ctrl K</kbd>
      </button>

      <dialog
        ref={dialog}
        className="palette"
        aria-label={t('title')}
        onClose={() => {
          setQuery('');
          setResults([]);
          setLoading(false);
          setFailed(false);
          request.current++;
        }}
        onClick={(e) => {
          // Un clic sullo sfondo (il <dialog> stesso) chiude.
          if (e.target === dialog.current) close();
        }}
      >
        <div className="palette-body">
          <label htmlFor="palette-input" className="sr-only">
            {t('label')}
          </label>
          <input
            id="palette-input"
            className="palette-input"
            role="combobox"
            aria-expanded={Boolean(query.trim())}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={query.trim() ? `${listId}-${active}` : undefined}
            placeholder={t('placeholder')}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              // I risultati della query precedente non sono più selezionabili: Invio andrebbe sullo snippet sbagliato.
              setResults([]);
              setFailed(false);
              setLoading(Boolean(e.target.value.trim()));
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((i) => (i + step + total) % total);
              } else if (e.key === 'Enter' && query.trim()) {
                e.preventDefault();
                choose(active);
              }
            }}
          />
          {query.trim() ? (
            <ul id={listId} role="listbox" aria-label={t('results')} className="palette-list">
              {shown.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette-option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                >
                  <span className="palette-title">{r.title}</span>
                  {r.excerpt ? (
                    <span className="palette-excerpt">
                      {splitExcerpt(r.excerpt).map((part, n) =>
                        part.mark ? (
                          <mark key={n}>{part.text}</mark>
                        ) : (
                          <span key={n}>{part.text}</span>
                        ),
                      )}
                    </span>
                  ) : null}
                </li>
              ))}
              <li
                id={`${listId}-${shown.length}`}
                role="option"
                aria-selected={active === shown.length}
                className="palette-option palette-advanced"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(shown.length);
                }}
              >
                {t('advanced')}
              </li>
            </ul>
          ) : (
            <p className="field-hint">{t('hint')}</p>
          )}
          {failed && !loading ? (
            <p role="alert" className="message message-error">
              {t('error')}
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {query.trim() && !loading && !failed ? t('count', { count: shown.length }) : ''}
          </p>
        </div>
      </dialog>
    </>
  );
}
