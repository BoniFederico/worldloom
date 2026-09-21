'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { calendarDateToInput } from '@/lib/calendars/input';
import { formatDate } from '@/lib/calendars/calendar';
import type { NamedCalendar } from '@/lib/calendars/load';
import type { FieldDefinition } from '@/lib/fields/fields';
import { dateInputName } from '@/lib/snippets/form';

type Props = {
  def: FieldDefinition;
  calendars: NamedCalendar[];
  value: unknown;
  /** Valori digitati prima di un salvataggio non riuscito (`f:<chiave>:<parte>`). */
  draft: Record<string, string> | undefined;
  invalid: boolean;
  worldId: string;
};

/** Editor di un campo «data in calendario»: calendario, era, anno, mese e giorno, con mesi ed ere del calendario scelto. */
export function CalendarDateField({ def, calendars, value, draft, invalid, worldId }: Props) {
  const t = useTranslations('Snippets');
  const tc = useTranslations('Categories');
  const stored = (value as { calendar?: unknown } | null)?.calendar;
  const draftCalendar = draft?.[dateInputName(def.key, 'calendar')];
  const initial =
    calendars.find((c) => c.id === (draftCalendar ?? stored))?.id ?? calendars[0]?.id ?? '';
  const [calendarId, setCalendarId] = useState(initial);
  const current = calendars.find((c) => c.id === calendarId);
  const label = def.required ? `${def.label} (${tc('required')})` : def.label;

  if (!current) {
    // Nessun calendario (o quello del valore è stato eliminato): il valore esistente resta com'è.
    const v = value as { year?: number; month?: number; day?: number } | null;
    return (
      <div className="field">
        <p>{label}</p>
        {v && typeof v.year === 'number' ? (
          <p className="field-hint">
            {t('dateRaw', { year: v.year, month: v.month ?? 0, day: v.day ?? 0 })}
          </p>
        ) : null}
        <p className="field-hint">
          {t('noCalendars')}{' '}
          <Link href={`/worlds/${worldId}/calendars`}>{t('manageCalendars')}</Link>
        </p>
      </div>
    );
  }

  // Valori iniziali: quelli digitati, altrimenti il valore salvato letto nel calendario scelto.
  const fromValue = stored === calendarId ? calendarDateToInput(current.calendar, value) : null;
  const part = (name: 'era' | 'year' | 'month' | 'day') =>
    draft?.[dateInputName(def.key, name)] ?? fromValue?.[name] ?? '';
  const id = `field-${def.key}`;
  const hasValue = !!fromValue && stored === calendarId;

  return (
    <fieldset className="field field-date" aria-describedby={invalid ? `${id}-err` : undefined}>
      <legend>{label}</legend>
      {calendars.length > 1 ? (
        <div className="field">
          <label htmlFor={`${id}-calendar`}>{t('calendar')}</label>
          <select
            id={`${id}-calendar`}
            name={dateInputName(def.key, 'calendar')}
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name={dateInputName(def.key, 'calendar')} value={calendarId} />
      )}
      <div className="form-inline-pair" key={calendarId}>
        {current.calendar.eras.length ? (
          <div className="field">
            <label htmlFor={`${id}-era`}>{t('era')}</label>
            <select
              id={`${id}-era`}
              name={dateInputName(def.key, 'era')}
              defaultValue={part('era')}
              aria-invalid={invalid}
            >
              <option value="">—</option>
              {current.calendar.eras.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`${id}-year`}>{t('year')}</label>
          <input
            id={`${id}-year`}
            name={dateInputName(def.key, 'year')}
            type="number"
            step={1}
            defaultValue={part('year')}
            aria-invalid={invalid}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-month`}>{t('month')}</label>
          <select
            id={`${id}-month`}
            name={dateInputName(def.key, 'month')}
            defaultValue={part('month')}
            aria-invalid={invalid}
          >
            <option value="">—</option>
            {current.calendar.months.map((m, i) => (
              <option key={m.name} value={i + 1}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-day`}>{t('day')}</label>
          <input
            id={`${id}-day`}
            name={dateInputName(def.key, 'day')}
            type="number"
            min={1}
            step={1}
            defaultValue={part('day')}
            aria-invalid={invalid}
          />
        </div>
      </div>
      {hasValue && value ? (
        <p className="field-hint">
          {t('dateIs', {
            date: formatDate(
              current.calendar,
              value as { year: number; month: number; day: number },
            ),
          })}
        </p>
      ) : null}
      {invalid ? (
        <p className="field-hint" id={`${id}-err`}>
          {t('dateInvalid')}
        </p>
      ) : null}
    </fieldset>
  );
}
