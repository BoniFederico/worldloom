'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { submitStats, type StatsState } from '@/app/campaigns/[campaignId]/stats/actions';
import type { StatsError } from '@/lib/stats/schema';

/**
 * Editor JSON dello schema di statistiche (solo DM). «Verifica» controlla senza salvare; gli errori tornano con riga, colonna
 * e campo e il testo digitato resta nel campo.
 */
export function StatsEditor({
  campaignId,
  initialText,
}: {
  campaignId: string;
  initialText: string;
}) {
  const t = useTranslations('Stats');
  const [state, action, pending] = useActionState<StatsState, FormData>(submitStats, {
    status: 'idle',
    text: initialText,
    errors: [],
  });

  const describe = (e: StatsError) => {
    const detail = e.detail ?? '';
    const reason = t.has(`formulaCodes.${detail}`) ? t(`formulaCodes.${detail}`) : detail;
    const where = t('formulaAt', { index: (e.index ?? 0) + 1 });
    const key = `codes.${e.code}`;
    return t.has(key) ? t(key, { field: e.field, detail, reason, where }) : e.code;
  };

  return (
    <form action={action} className="form">
      <input type="hidden" name="campaign" value={campaignId} />
      {state.status === 'checked' || state.status === 'saved' ? (
        <p role="status" className="message message-info">
          {t(`states.${state.status}`)}
        </p>
      ) : null}
      {state.status === 'forbidden' || state.status === 'failed' ? (
        <p role="alert" className="message message-error">
          {t(`states.${state.status}`)}
        </p>
      ) : null}
      {state.status === 'invalid' ? (
        <div role="alert" className="message message-error">
          <p>
            <strong>{t('errorsTitle')}</strong>
          </p>
          <ul className="stats-errors">
            {state.errors.map((e, n) => (
              <li key={n}>
                <span className="role">
                  {e.line ? t('at', { line: e.line, column: e.column ?? 1 }) : t('noLine')}
                </span>{' '}
                {describe(e)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="stats-schema">{t('schemaLabel')}</label>
        <textarea
          id="stats-schema"
          name="schema"
          className="code-area"
          rows={24}
          spellCheck={false}
          defaultValue={state.text}
          maxLength={200000}
          required
        />
      </div>
      <div className="form-actions">
        <button type="submit" name="intent" value="check" className="btn" disabled={pending}>
          {t('check')}
        </button>
        <button
          type="submit"
          name="intent"
          value="save"
          className="btn btn-primary"
          disabled={pending}
        >
          {t('save')}
        </button>
      </div>
    </form>
  );
}
