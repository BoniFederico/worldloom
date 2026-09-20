import { fieldsSchema, type FieldDefinition } from '@/lib/fields/fields';
import type { CategoryColor, CategoryIcon } from './catalog';

type PresetField = {
  key: string;
  type: FieldDefinition['type'];
  optionKeys?: string[];
  min?: number;
};

export type Preset = {
  id: string;
  icon: CategoryIcon;
  color: CategoryColor;
  fields: PresetField[];
};

/** Preset di partenza: puro punto di partenza, ogni categoria creata resta modificabile ed eliminabile. */
export const PRESETS: Preset[] = [
  {
    id: 'character',
    icon: 'user',
    color: 'teal',
    fields: [
      { key: 'birth', type: 'calendar_date' },
      { key: 'death', type: 'calendar_date' },
      { key: 'home', type: 'snippet_ref' },
      { key: 'status', type: 'choice', optionKeys: ['alive', 'dead', 'missing', 'unknown'] },
      { key: 'portrait', type: 'image' },
    ],
  },
  {
    id: 'place',
    icon: 'map-pin',
    color: 'moss',
    fields: [
      {
        key: 'kind',
        type: 'choice',
        optionKeys: ['region', 'city', 'building', 'dungeon', 'other'],
      },
      { key: 'location', type: 'coordinates' },
      { key: 'parent', type: 'snippet_ref' },
    ],
  },
  {
    id: 'event',
    icon: 'calendar-days',
    color: 'brass',
    fields: [
      { key: 'start', type: 'calendar_date' },
      { key: 'end', type: 'calendar_date' },
      { key: 'place', type: 'snippet_ref' },
    ],
  },
  {
    id: 'chapter',
    icon: 'book-open',
    color: 'slate',
    fields: [
      { key: 'number', type: 'number', min: 1 },
      { key: 'pov', type: 'snippet_ref' },
      { key: 'summary', type: 'text' },
    ],
  },
  {
    id: 'item',
    icon: 'gem',
    color: 'plum',
    fields: [
      { key: 'kind', type: 'choice', optionKeys: ['weapon', 'armor', 'tool', 'relic', 'other'] },
      { key: 'owner', type: 'snippet_ref' },
      { key: 'picture', type: 'image' },
    ],
  },
  {
    id: 'faction',
    icon: 'flag',
    color: 'rust',
    fields: [
      { key: 'founded', type: 'calendar_date' },
      { key: 'leader', type: 'snippet_ref' },
      { key: 'base', type: 'snippet_ref' },
    ],
  },
  {
    id: 'rule',
    icon: 'scroll-text',
    color: 'ocean',
    fields: [{ key: 'source', type: 'text' }],
  },
];

/** Accesso al catalogo messaggi (chiavi puntate sotto `Presets`). */
export type PresetText = { text: (key: string) => string };

export type BuiltPreset = {
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
  fields: FieldDefinition[];
};

/** Costruisce la categoria con etichette e opzioni nella lingua dell'utente e la valida. */
export function buildPreset(preset: Preset, msg: PresetText): BuiltPreset {
  const fields = preset.fields.map((f): FieldDefinition => {
    const def: FieldDefinition = {
      key: f.key,
      label: msg.text(`${preset.id}.fields.${f.key}`),
      type: f.type,
    };
    if (f.optionKeys) def.options = f.optionKeys.map((o) => msg.text(`${preset.id}.options.${o}`));
    if (f.min !== undefined) def.min = f.min;
    return def;
  });
  return {
    name: msg.text(`${preset.id}.name`),
    icon: preset.icon,
    color: preset.color,
    fields: fieldsSchema.parse(fields),
  };
}
