'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useDeferredValue, useMemo, useState } from 'react';
import { submitStats, type StatsState } from '@/app/campaigns/[campaignId]/stats/actions';
import { CharacterSheetFields, type Translate } from '@/components/character-sheet-fields';
import { readSheet } from '@/lib/characters/sheet';
import { computeSheet } from '@/lib/stats/compute';
import { validateStatsText, type StatsError } from '@/lib/stats/schema';

/**
 * Editor JSON dello schema di statistiche (solo DM). Mentre si scrive, lo schema si controlla nel browser (errori con riga e
 * colonna) e la scheda si ridisegna: è l'anteprima live. «Verifica» e «Salva» passano dal server (che ricontrolla tutto);
 * se il salvataggio tocca schede esistenti compare la migrazione guidata.
 */
export function StatsEditor({
  campaignId,
  initialText,
}: {
  campaignId: string;
  initialText: string;
}) {
  const t = useTranslations('Stats');
  const tc = useTranslations('Characters');
  const [state, action, pending] = useActionState<StatsState, FormData>(submitStats, {
    status: 'idle',
    text: initialText,
    errors: [],
  });
  const [text, setText] = useState(initialText);
  const deferred = useDeferredValue(text);
  const live = useMemo(() => validateStatsText(deferred), [deferred]);
  const valid = useMemo(
    () => (live.ok ? { schema: live.schema, derivedOrder: live.derivedOrder } : null),
    [live],
  );
  // La migrazione proposta vale per il testo con cui è stata calcolata: se si modifica lo schema, va richiesta di nuovo.
  const migration =
    // Il modulo invia gli a capo come CRLF: si confronta con il testo normalizzato.
    state.status === 'migration' && state.text.split('\r\n').join('\n') === text
      ? state.migration
      : undefined;

  const describe = (e: StatsError) => {
    const detail = e.detail ?? '';
    const reason = t.has(`formulaCodes.${detail}`) ? t(`formulaCodes.${detail}`) : detail;
    const where = t('formulaAt', { index: (e.index ?? 0) + 1 });
    const key = `codes.${e.code}`;
    return t.has(key) ? t(key, { field: e.field, detail, reason, where }) : e.code;
  };
  const translate: Translate = (key, values) => tc(key, values);

  return (
    <>
      <form action={action} className="form">
        <input type="hidden" name="campaign" value={campaignId} />
        {state.status === 'checked' || state.status === 'saved' ? (
          <p role="status" className="message message-info">
            {t(`states.${state.status}`)}
          </p>
        ) : null}
        {state.status === 'migrated' ? (
          <p role="status" className="message message-info">
            {t('states.migrated', { count: state.updated ?? 0 })}
          </p>
        ) : null}
        {state.status === 'forbidden' ||
        state.status === 'failed' ||
        state.status === 'conflict' ||
        state.status === 'invalid_move' ? (
          <p role="alert" className="message message-error">
            {t(`states.${state.status}`)}
          </p>
        ) : null}
        {!live.ok ? (
          <div role="alert" className="message message-error">
            <p>
              <strong>{t('errorsTitle')}</strong>
            </p>
            <ul className="stats-errors">
              {live.errors.map((e, n) => (
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200000}
            required
          />
        </div>

        {migration ? (
          <section className="migration" aria-labelledby="migration-title">
            <h3 id="migration-title">{t('migrationTitle')}</h3>
            <p>{t('migrationIntro', { count: migration.sheetsChanged })}</p>
            {migration.clamped ? (
              <p className="field-hint">{t('migrationClamped', { count: migration.clamped })}</p>
            ) : null}
            {migration.items.map((item) => (
              <div className="field" key={item.ref}>
                <label htmlFor={`move-${item.ref}`}>
                  {t('migrationField', { label: item.label, count: item.sheets })}
                </label>
                <select
                  id={`move-${item.ref}`}
                  name={`move:${item.ref}`}
                  defaultValue={item.suggestion}
                >
                  <option value="">{t('migrationDrop')}</option>
                  {item.targets.map((target) => (
                    <option key={target.key} value={target.key}>
                      {t('migrationMove', { label: target.label })}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="submit"
              name="intent"
              value="migrate"
              className="btn btn-primary"
              disabled={pending}
            >
              {t('migrate')}
            </button>
            <p className="field-hint">{t('migrationCancel')}</p>
          </section>
        ) : (
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
        )}
      </form>

      <h2>{t('livePreviewTitle')}</h2>
      {valid ? (
        <>
          <p className="field-hint">{t('livePreviewHint')}</p>
          <div className="sheet-preview">
            <CharacterSheetFields
              valid={valid}
              sheet={readSheet({}, valid)}
              computed={computeSheet(valid, {})}
              readOnly
              idPrefix="live"
              t={translate}
            />
          </div>
        </>
      ) : (
        <p className="empty">{t('livePreviewInvalid')}</p>
      )}
    </>
  );
}
