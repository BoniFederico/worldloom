'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useSyncExternalStore } from 'react';
import { saveSnippet } from '@/app/worlds/[worldId]/snippets/actions';
import { CategoryBadge } from '@/components/category-icon';
import { RichEditor } from '@/components/rich-editor';
import { sanitizeBody, type DocNode } from '@/lib/snippets/body';
import type { FieldDefinition } from '@/lib/fields/fields';
import { EDITABLE_TYPES, fieldInputName } from '@/lib/snippets/form';
import type { SaveState } from '@/lib/snippets/state';

type Props = {
  worldId: string;
  snippet: {
    id: string;
    title: string;
    status: string;
    body: string;
    doc: DocNode;
    updatedAt: string;
    categoryIds: string[];
    values: Record<string, unknown>;
  };
  categories: { id: string; name: string; icon: string; color: string }[];
  defs: FieldDefinition[];
  refs: { id: string; title: string }[];
};

/**
 * Form di modifica dello snippet. Se il salvataggio non riesce (validazione, conflitto) l'azione restituisce
 * quanto era stato digitato e il form lo ripropone: l'utente non perde mai il proprio lavoro.
 */
export function SnippetForm({ worldId, snippet, categories, defs, refs }: Props) {
  const t = useTranslations('Snippets');
  const tc = useTranslations('Categories');
  const [state, action] = useActionState<SaveState, FormData>(saveSnippet, null);
  const draft = state?.draft;
  // Prima dell'idratazione (e senza JavaScript) il testo si modifica in un campo semplice; dopo, con l'editor.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [token, setToken] = useState(snippet.updatedAt);
  const startDoc = (() => {
    if (!draft?.bodyJson) return snippet.doc;
    try {
      return sanitizeBody(JSON.parse(draft.bodyJson));
    } catch {
      return snippet.doc;
    }
  })();
  const badKeys = new Set(state?.keys ?? []);
  const selected = new Set(draft ? draft.categories : snippet.categoryIds);

  return (
    <form action={action} className="form" key={state?.nonce ?? 0}>
      <input type="hidden" name="world" value={worldId} />
      <input type="hidden" name="id" value={snippet.id} />
      <input type="hidden" name="updated" value={token} />
      {state ? (
        <p role="alert" className="message message-error">
          {t.has(`errors.${state.error}`) ? t(`errors.${state.error}`) : t('errors.generic')}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="title">{t('titleLabel')}</label>
        <input
          id="title"
          name="title"
          defaultValue={draft?.title ?? snippet.title}
          maxLength={300}
          required
        />
      </div>

      <fieldset className="presets">
        <legend>{t('categoriesLegend')}</legend>
        {categories.length ? (
          categories.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                name="category"
                value={c.id}
                defaultChecked={selected.has(c.id)}
              />
              <CategoryBadge icon={c.icon} color={c.color} />
              {c.name}
            </label>
          ))
        ) : (
          <p className="field-hint">{t('noCategoriesYet')}</p>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="status">{t('statusLabel')}</label>
        <select id="status" name="status" defaultValue={draft?.status ?? snippet.status}>
          <option value="draft">{t('status.draft')}</option>
          <option value="final">{t('status.final')}</option>
        </select>
        <p className="field-hint">{t('statusHint')}</p>
      </div>

      <div className="field">
        <span id="body-label" className="label">
          {t('bodyLabel')}
        </span>
        {hydrated ? (
          <RichEditor
            worldId={worldId}
            snippetId={snippet.id}
            initialDoc={startDoc}
            token={token}
            onToken={setToken}
          />
        ) : (
          <textarea
            id="body"
            name="body"
            rows={12}
            aria-labelledby="body-label"
            defaultValue={draft?.body ?? snippet.body}
          />
        )}
      </div>

      {defs.length ? <h2>{t('fieldsTitle')}</h2> : null}
      {defs.map((def) => {
        if (!EDITABLE_TYPES.includes(def.type)) {
          return (
            <p key={def.key} className="field-hint">
              {def.label}: {t('editElsewhere')}
            </p>
          );
        }
        const name = fieldInputName(def.key);
        const id = `field-${def.key}`;
        const raw = snippet.values[def.key];
        const value = draft?.fields[name] ?? (raw === undefined || raw === null ? '' : String(raw));
        const invalid = badKeys.has(def.key);
        const label = def.required ? `${def.label} (${tc('required')})` : def.label;
        return (
          <div className="field" key={def.key}>
            <label htmlFor={id}>{label}</label>
            {def.type === 'choice' || def.type === 'snippet_ref' ? (
              <select id={id} name={name} defaultValue={value} aria-invalid={invalid}>
                <option value="">—</option>
                {def.type === 'choice'
                  ? def.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))
                  : refs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
              </select>
            ) : (
              <input
                id={id}
                name={name}
                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                step={def.type === 'number' ? 'any' : undefined}
                min={def.type === 'number' ? def.min : undefined}
                max={def.type === 'number' ? def.max : undefined}
                defaultValue={value}
                aria-invalid={invalid}
              />
            )}
            {invalid ? <p className="field-hint">{t('fieldInvalid')}</p> : null}
          </div>
        );
      })}

      <button type="submit" className="btn btn-primary">
        {t('save')}
      </button>
    </form>
  );
}
