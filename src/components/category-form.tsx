import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/submit-button';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/categories/catalog';

type Props = {
  action: (formData: FormData) => Promise<void>;
  worldId: string;
  categoryId?: string;
  values?: { name: string; icon: string; color: string };
  submitLabel: string;
};

/** Campi comuni di creazione e modifica: nome, icona (select) e colore (radio con campione). */
export async function CategoryForm({ action, worldId, categoryId, values, submitLabel }: Props) {
  const t = await getTranslations('Categories');
  const color = values?.color ?? CATEGORY_COLORS[0];
  return (
    <form action={action} className="form">
      <input type="hidden" name="world" value={worldId} />
      {categoryId ? <input type="hidden" name="id" value={categoryId} /> : null}
      <div className="field">
        <label htmlFor="cat-name">{t('name')}</label>
        <input
          id="cat-name"
          name="name"
          defaultValue={values?.name}
          maxLength={80}
          autoComplete="off"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="cat-icon">{t('icon')}</label>
        <select id="cat-icon" name="icon" defaultValue={values?.icon ?? CATEGORY_ICONS[0]}>
          {CATEGORY_ICONS.map((icon) => (
            <option key={icon} value={icon}>
              {t(`icons.${icon}`)}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="swatches">
        <legend>{t('color')}</legend>
        {CATEGORY_COLORS.map((c) => (
          <label key={c} className="swatch" data-color={c}>
            <input type="radio" name="color" value={c} defaultChecked={c === color} />
            <span className="swatch-dot" aria-hidden="true" />
            {t(`colors.${c}`)}
          </label>
        ))}
      </fieldset>
      <SubmitButton className="btn btn-primary">{submitLabel}</SubmitButton>
    </form>
  );
}
