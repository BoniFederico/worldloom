import { ArrowDown, ArrowUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import {
  addFieldAction,
  moveFieldAction,
  removeFieldAction,
  updateFieldAction,
} from '@/app/worlds/[worldId]/categories/actions';
import { FIELD_TYPES, type FieldDefinition } from '@/lib/fields/fields';

type Props = { worldId: string; categoryId: string; fields: FieldDefinition[]; canWrite: boolean };

function Hidden({
  worldId,
  categoryId,
  fieldKey,
}: {
  worldId: string;
  categoryId: string;
  fieldKey?: string;
}) {
  return (
    <>
      <input type="hidden" name="world" value={worldId} />
      <input type="hidden" name="id" value={categoryId} />
      {fieldKey ? <input type="hidden" name="key" value={fieldKey} /> : null}
    </>
  );
}

/**
 * Elenco dei campi con modifica, riordino e rimozione. Ogni azione è un form: funziona senza JavaScript,
 * e i dettagli di modifica usano l'elemento nativo <details>.
 */
export async function FieldsEditor({ worldId, categoryId, fields, canWrite }: Props) {
  const t = await getTranslations('Categories');
  return (
    <>
      <h2>{t('fieldsTitle')}</h2>
      {fields.length === 0 ? (
        <p className="empty">{t('noFields')}</p>
      ) : (
        <ul className="field-list">
          {fields.map((f, index) => (
            <li key={f.key}>
              <div className="field-row">
                <span className="field-name">
                  {f.label}
                  {f.required ? <span className="role"> ({t('required')})</span> : null}
                </span>
                <span className="role">
                  {t(`fieldTypes.${f.type}`)}
                  {f.options ? `: ${f.options.join(', ')}` : ''}
                  {f.min !== undefined || f.max !== undefined
                    ? ` (${f.min ?? '…'} – ${f.max ?? '…'})`
                    : ''}
                </span>
                {canWrite ? (
                  <span className="field-actions">
                    {(['up', 'down'] as const).map((direction) => {
                      const disabled =
                        direction === 'up' ? index === 0 : index === fields.length - 1;
                      const Icon = direction === 'up' ? ArrowUp : ArrowDown;
                      return (
                        <form key={direction} action={moveFieldAction}>
                          <Hidden worldId={worldId} categoryId={categoryId} fieldKey={f.key} />
                          <input type="hidden" name="direction" value={direction} />
                          <button type="submit" className="btn btn-icon" disabled={disabled}>
                            <Icon size={16} aria-hidden="true" />
                            <span className="sr-only">
                              {t(direction === 'up' ? 'moveUp' : 'moveDown', { name: f.label })}
                            </span>
                          </button>
                        </form>
                      );
                    })}
                  </span>
                ) : null}
              </div>

              {canWrite ? (
                <details className="field-edit">
                  <summary>
                    {t('editField')}
                    <span className="sr-only"> {f.label}</span>
                  </summary>
                  <form action={updateFieldAction} className="form">
                    <Hidden worldId={worldId} categoryId={categoryId} fieldKey={f.key} />
                    <div className="field">
                      <label htmlFor={`label-${f.key}`}>{t('fieldLabel')}</label>
                      <input
                        id={`label-${f.key}`}
                        name="label"
                        defaultValue={f.label}
                        maxLength={80}
                        required
                      />
                    </div>
                    <label className="check">
                      <input type="checkbox" name="required" defaultChecked={f.required} />
                      {t('fieldRequired')}
                    </label>
                    {f.type === 'choice' ? (
                      <div className="field">
                        <label htmlFor={`options-${f.key}`}>{t('fieldOptions')}</label>
                        <textarea
                          id={`options-${f.key}`}
                          name="options"
                          rows={4}
                          defaultValue={f.options?.join('\n')}
                          required
                        />
                        <p className="field-hint">{t('fieldOptionsHint')}</p>
                      </div>
                    ) : null}
                    {f.type === 'number' ? (
                      <div className="form-inline-pair">
                        <div className="field">
                          <label htmlFor={`min-${f.key}`}>{t('fieldMin')}</label>
                          <input
                            id={`min-${f.key}`}
                            name="min"
                            type="number"
                            step="any"
                            defaultValue={f.min}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`max-${f.key}`}>{t('fieldMax')}</label>
                          <input
                            id={`max-${f.key}`}
                            name="max"
                            type="number"
                            step="any"
                            defaultValue={f.max}
                          />
                        </div>
                      </div>
                    ) : null}
                    <button type="submit" className="btn">
                      {t('save')}
                    </button>
                  </form>
                  <form action={removeFieldAction}>
                    <Hidden worldId={worldId} categoryId={categoryId} fieldKey={f.key} />
                    <button type="submit" className="btn btn-danger">
                      {t('removeField')}
                    </button>
                    <p className="field-hint">{t('removeFieldHint')}</p>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <details className="field-edit" open={fields.length === 0}>
          <summary>{t('addFieldTitle')}</summary>
          <form action={addFieldAction} className="form">
            <Hidden worldId={worldId} categoryId={categoryId} />
            <div className="field">
              <label htmlFor="new-label">{t('fieldLabel')}</label>
              <input id="new-label" name="label" maxLength={80} autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="new-type">{t('fieldType')}</label>
              <select id="new-type" name="type" defaultValue="text">
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`fieldTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" name="required" />
              {t('fieldRequired')}
            </label>
            <div className="field">
              <label htmlFor="new-options">{t('fieldOptions')}</label>
              <textarea id="new-options" name="options" rows={3} />
              <p className="field-hint">{t('fieldOptionsOnlyChoice')}</p>
            </div>
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="new-min">{t('fieldMin')}</label>
                <input id="new-min" name="min" type="number" step="any" />
              </div>
              <div className="field">
                <label htmlFor="new-max">{t('fieldMax')}</label>
                <input id="new-max" name="max" type="number" step="any" />
              </div>
            </div>
            <p className="field-hint">{t('fieldLimitsOnlyNumber')}</p>
            <button type="submit" className="btn btn-primary">
              {t('addField')}
            </button>
          </form>
        </details>
      ) : null}
    </>
  );
}
