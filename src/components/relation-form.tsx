'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  createRelation,
  type RelationState,
} from '@/app/worlds/[worldId]/snippets/relation-actions';

type Props = {
  worldId: string;
  snippetId: string;
  targets: { id: string; title: string }[];
  labels: string[];
  inverses: string[];
};

/** Formulario per aggiungere una relazione. Se non riesce, riproposto con quanto era stato digitato. */
export function RelationForm({ worldId, snippetId, targets, labels, inverses }: Props) {
  const t = useTranslations('Relations');
  const [state, action] = useActionState<RelationState, FormData>(createRelation, null);
  const d = state?.draft ?? {};

  return (
    <form action={action} className="form" key={state ? 'error' : 'new'}>
      <input type="hidden" name="world" value={worldId} />
      <input type="hidden" name="id" value={snippetId} />
      {state ? (
        <p role="alert" className="message message-error">
          {t.has(`errors.${state.error}`)
            ? t(`errors.${state.error}`)
            : t('errors.relation_failed')}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="rel-target">{t('target')}</label>
        <select id="rel-target" name="target" defaultValue={d.target ?? ''} required>
          <option value="" disabled>
            {t('chooseTarget')}
          </option>
          {targets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="rel-label">{t('label')}</label>
        <input
          id="rel-label"
          name="label"
          list="rel-labels"
          defaultValue={d.label ?? ''}
          maxLength={120}
          autoComplete="off"
          aria-describedby="rel-label-hint"
          required
        />
        <datalist id="rel-labels">
          {labels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <p id="rel-label-hint" className="field-hint">
          {t('labelHint')}
        </p>
      </div>

      <div className="field">
        <label htmlFor="rel-inverse">{t('inverse')}</label>
        <input
          id="rel-inverse"
          name="inverse"
          list="rel-inverses"
          defaultValue={d.inverse ?? ''}
          maxLength={120}
          autoComplete="off"
          aria-describedby="rel-inverse-hint"
        />
        <datalist id="rel-inverses">
          {inverses.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <p id="rel-inverse-hint" className="field-hint">
          {t('inverseHint')}
        </p>
      </div>

      <div className="field">
        <label htmlFor="rel-notes">{t('notes')}</label>
        <textarea id="rel-notes" name="notes" rows={3} defaultValue={d.notes ?? ''} />
      </div>

      <details className="field-edit" open={Boolean(d.from_year || d.to_year)}>
        <summary>{t('validity')}</summary>
        <p className="field-hint">{t('validityHint')}</p>
        <TimeFields prefix="from" legend={t('validFrom')} values={d} />
        <TimeFields prefix="to" legend={t('validTo')} values={d} />
      </details>

      <button type="submit" className="btn btn-primary">
        {t('add')}
      </button>
    </form>
  );
}

export function TimeFields({
  prefix,
  legend,
  values,
  idSuffix = '',
}: {
  prefix: 'from' | 'to';
  legend: string;
  values: Record<string, string | undefined>;
  idSuffix?: string;
}) {
  const t = useTranslations('Relations');
  const part = (key: 'year' | 'month' | 'day') => `${prefix}_${key}`;
  return (
    <fieldset className="time-fields">
      <legend>{legend}</legend>
      {(['year', 'month', 'day'] as const).map((key) => (
        <div className="field" key={key}>
          <label htmlFor={`${part(key)}${idSuffix}`}>{t(key)}</label>
          <input
            id={`${part(key)}${idSuffix}`}
            name={part(key)}
            type="number"
            inputMode="numeric"
            step={1}
            defaultValue={values[part(key)] ?? ''}
          />
        </div>
      ))}
    </fieldset>
  );
}
