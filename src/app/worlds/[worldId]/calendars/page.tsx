import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { addDays, formatDate, weekdayOf } from '@/lib/calendars/calendar';
import { calendarToForm } from '@/lib/calendars/input';
import { loadCalendars } from '@/lib/calendars/load';
import { loadWorld } from '@/lib/worlds/context';
import { createCalendar, deleteCalendar, updateCalendar } from './actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Values = ReturnType<typeof calendarToForm> & { name: string };

function CalendarFields({
  prefix,
  values,
  t,
}: {
  prefix: string;
  values: Values;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${prefix}-name`}>{t('name')}</label>
        <input
          id={`${prefix}-name`}
          name="name"
          defaultValue={values.name}
          maxLength={80}
          autoComplete="off"
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-months`}>{t('months')}</label>
        <textarea
          id={`${prefix}-months`}
          name="months"
          rows={6}
          defaultValue={values.months}
          required
          aria-describedby={`${prefix}-months-hint`}
        />
        <p className="field-hint" id={`${prefix}-months-hint`}>
          {t('monthsHint')}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-weekdays`}>{t('weekdays')}</label>
        <input
          id={`${prefix}-weekdays`}
          name="weekdays"
          defaultValue={values.weekdays}
          autoComplete="off"
          aria-describedby={`${prefix}-weekdays-hint`}
        />
        <p className="field-hint" id={`${prefix}-weekdays-hint`}>
          {t('weekdaysHint')}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-epoch`}>{t('epochWeekday')}</label>
        <input
          id={`${prefix}-epoch`}
          name="epochWeekday"
          type="number"
          min={1}
          defaultValue={values.epochWeekday}
        />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-eras`}>{t('eras')}</label>
        <textarea
          id={`${prefix}-eras`}
          name="eras"
          rows={3}
          defaultValue={values.eras}
          aria-describedby={`${prefix}-eras-hint`}
        />
        <p className="field-hint" id={`${prefix}-eras-hint`}>
          {t('erasHint')}
        </p>
      </div>
      <fieldset className="field">
        <legend>{t('leap')}</legend>
        <p className="field-hint">{t('leapHint')}</p>
        <div className="form-inline-pair">
          <div className="field">
            <label htmlFor={`${prefix}-leap-every`}>{t('leapEvery')}</label>
            <input
              id={`${prefix}-leap-every`}
              name="leapEvery"
              type="number"
              min={2}
              defaultValue={values.leapEvery}
            />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-leap-month`}>{t('leapMonth')}</label>
            <input
              id={`${prefix}-leap-month`}
              name="leapMonth"
              type="number"
              min={1}
              defaultValue={values.leapMonth}
            />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-leap-days`}>{t('leapDays')}</label>
            <input
              id={`${prefix}-leap-days`}
              name="leapDays"
              type="number"
              min={1}
              defaultValue={values.leapDays}
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}

const emptyValues: Values = {
  name: '',
  months: '',
  weekdays: '',
  eras: '',
  leapEvery: '',
  leapMonth: '',
  leapDays: '',
  epochWeekday: '1',
};

export default async function CalendarsPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const query = await searchParams;
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, calendars] = await Promise.all([
    getTranslations('Calendars'),
    loadCalendars(supabase, worldId),
  ]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Calendars" notice={one(query.notice)} error={one(query.error)} />

        {calendars.length ? (
          <ul className="relations">
            {calendars.map(({ id, name, calendar }) => {
              const origin = { year: 0, month: 1, day: 1 };
              const daysPerYear = calendar.months.reduce((sum, m) => sum + m.days, 0);
              const sample = addDays(calendar, origin, daysPerYear * 2 + 9);
              return (
                <li key={id}>
                  <h2>{name}</h2>
                  <p className="role">
                    {t('summary', {
                      months: calendar.months.length,
                      days: daysPerYear,
                      weekdays: calendar.weekdays.length,
                      eras: calendar.eras.length,
                    })}
                  </p>
                  <p className="field-hint">
                    {t('example', {
                      date: formatDate(calendar, sample),
                      weekday: weekdayOf(calendar, sample) ?? '—',
                    })}
                  </p>
                  {canWrite ? (
                    <>
                      <details className="field-edit">
                        <summary>
                          {t('edit')}
                          <span className="sr-only"> {name}</span>
                        </summary>
                        <form action={updateCalendar} className="form">
                          <input type="hidden" name="world" value={world.id} />
                          <input type="hidden" name="id" value={id} />
                          <CalendarFields
                            prefix={`cal-${id}`}
                            values={{ name, ...calendarToForm(calendar) }}
                            t={t}
                          />
                          <button type="submit" className="btn">
                            {t('save')}
                          </button>
                        </form>
                      </details>
                      <form action={deleteCalendar}>
                        <input type="hidden" name="world" value={world.id} />
                        <input type="hidden" name="id" value={id} />
                        <button type="submit" className="btn btn-danger">
                          {t('remove')}
                          <span className="sr-only"> {name}</span>
                        </button>
                      </form>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canWrite ? (
          <>
            <h2>{t('createTitle')}</h2>
            <form action={createCalendar} className="form">
              <input type="hidden" name="world" value={world.id} />
              <CalendarFields prefix="new" values={emptyValues} t={t} />
              <button type="submit" className="btn btn-primary">
                {t('create')}
              </button>
            </form>
          </>
        ) : (
          <p className="field-hint">{t('readOnly')}</p>
        )}
      </section>
    </main>
  );
}
