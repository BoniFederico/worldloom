import { getTranslations } from 'next-intl/server';
import { LEVELS, type FieldLevel, type Level } from '@/lib/visibility/input';
import type { ShareTarget } from '@/lib/visibility/load';

type FieldRow = { key: string; label: string; level: FieldLevel; users: string[] };

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  /** Campi nascosti che identificano l'elemento e la pagina di ritorno. */
  hidden: Record<string, string>;
  /** Prefisso degli `id`, unico nella pagina. */
  idPrefix: string;
  level: Level;
  users: string[];
  targets: ShareTarget[];
  /** Solo per gli snippet: livello di ogni campo. */
  fields?: FieldRow[];
};

/**
 * Modulo di visibilità: livello, destinatari («giocatori scelti»), livello dei campi e nota. Tutto in un modulo semplice
 * (senza JavaScript): il DM sceglie e salva; il cambio viene registrato.
 */
export async function VisibilityForm({
  action,
  hidden,
  idPrefix,
  level,
  users,
  targets,
  fields = [],
}: Props) {
  const t = await getTranslations('Visibility');
  return (
    <form action={action} className="form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="field">
        <label htmlFor={`${idPrefix}-level`}>{t('level')}</label>
        <select id={`${idPrefix}-level`} name="level" defaultValue={level}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`levels.${l}`)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="fieldset">
        <legend>{t('usersLegend')}</legend>
        {targets.length === 0 ? (
          <p className="field-hint">{t('noPlayers')}</p>
        ) : (
          <>
            <p className="field-hint" id={`${idPrefix}-users-hint`}>
              {t('usersHint')}
            </p>
            <ul className="checklist" aria-describedby={`${idPrefix}-users-hint`}>
              {targets.map((target) => (
                <li key={target.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      name="users"
                      value={target.id}
                      defaultChecked={users.includes(target.id)}
                    />
                    {target.name}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      {fields.length ? (
        <fieldset className="fieldset">
          <legend>{t('fieldsLegend')}</legend>
          <p className="field-hint">{t('fieldsHint')}</p>
          {fields.map((f) => (
            <fieldset className="fieldset" key={f.key}>
              <legend>{t('fieldLegend', { name: f.label })}</legend>
              <label className="sr-only" htmlFor={`${idPrefix}-field-${f.key}`}>
                {t('fieldLevel')}
              </label>
              <select
                id={`${idPrefix}-field-${f.key}`}
                name={`field:${f.key}`}
                defaultValue={f.level}
              >
                {(['members', 'secret', 'shared'] as const).map((l) => (
                  <option key={l} value={l}>
                    {t(`fieldLevels.${l}`)}
                  </option>
                ))}
              </select>
              {targets.length ? (
                <details className="field-edit">
                  <summary>
                    {t('fieldUsers')}
                    <span className="sr-only"> {f.label}</span>
                  </summary>
                  <ul className="checklist">
                    {targets.map((target) => (
                      <li key={target.id}>
                        <label className="check">
                          <input
                            type="checkbox"
                            name={`users:${f.key}`}
                            value={target.id}
                            defaultChecked={f.users.includes(target.id)}
                          />
                          {target.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </fieldset>
          ))}
        </fieldset>
      ) : null}

      <div className="field">
        <label htmlFor={`${idPrefix}-note`}>{t('note')}</label>
        <textarea id={`${idPrefix}-note`} name="note" rows={2} maxLength={500} />
      </div>
      <button type="submit" className="btn">
        {t('save')}
      </button>
    </form>
  );
}
