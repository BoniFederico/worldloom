import type { StatsSchema } from './schema';

/** Schemi di partenza importabili (SPEC): d20, punteggi a percentuale, pool di dadi, sistema narrativo a tratti. */
export type StatsPreset = {
  id: 'd20' | 'percentile' | 'dice-pool' | 'narrative';
  schema: StatsSchema;
};

const d20: StatsSchema = {
  schemaVersion: 1,
  name: 'Fantasy d20 semplificato',
  description: 'Sei punteggi, modificatori calcolati, punti ferita e classe armatura.',
  attributes: [
    { key: 'level', label: 'Livello', type: 'integer', min: 1, max: 20, default: 1 },
    { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30, default: 10 },
    { key: 'dex', label: 'Destrezza', type: 'integer', min: 1, max: 30, default: 10 },
    { key: 'con', label: 'Costituzione', type: 'integer', min: 1, max: 30, default: 10 },
    { key: 'int', label: 'Intelligenza', type: 'integer', min: 1, max: 30, default: 10 },
    { key: 'wis', label: 'Saggezza', type: 'integer', min: 1, max: 30, default: 10 },
    { key: 'cha', label: 'Carisma', type: 'integer', min: 1, max: 30, default: 10 },
  ],
  derived: [
    { key: 'str_mod', label: 'Mod. Forza', formula: 'floor((str - 10) / 2)' },
    { key: 'dex_mod', label: 'Mod. Destrezza', formula: 'floor((dex - 10) / 2)' },
    { key: 'con_mod', label: 'Mod. Costituzione', formula: 'floor((con - 10) / 2)' },
    { key: 'prof', label: 'Bonus di competenza', formula: '2 + floor((level - 1) / 4)' },
    { key: 'ac', label: 'Classe armatura', formula: '10 + dex_mod' },
  ],
  resources: [
    {
      key: 'hp',
      label: 'Punti ferita',
      type: 'pool',
      maxFormula: '10 + con_mod + (level - 1) * (6 + con_mod)',
    },
  ],
  lists: [
    { key: 'skills', label: 'Abilità', item: { name: 'text', rank: 'integer' } },
    {
      key: 'inventory',
      label: 'Inventario',
      item: { name: 'text', qty: 'integer', weight: 'number' },
    },
  ],
  text: [{ key: 'background', label: 'Background' }],
  layout: [
    { section: 'Punteggi', fields: ['level', 'str', 'dex', 'con', 'int', 'wis', 'cha'] },
    { section: 'Combattimento', fields: ['hp', 'ac', 'prof', 'str_mod', 'dex_mod', 'con_mod'] },
    { section: 'Equipaggiamento', fields: ['skills', 'inventory', 'background'] },
  ],
};

const percentile: StatsSchema = {
  schemaVersion: 1,
  name: 'Punteggi a percentuale',
  description:
    'Caratteristiche da 1 a 99 con soglie dimezzate e quintuplicate, punti ferita e sanità.',
  attributes: [
    { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 99, default: 50 },
    { key: 'con', label: 'Costituzione', type: 'integer', min: 1, max: 99, default: 50 },
    { key: 'siz', label: 'Corporatura', type: 'integer', min: 1, max: 99, default: 50 },
    { key: 'dex', label: 'Destrezza', type: 'integer', min: 1, max: 99, default: 50 },
    { key: 'int', label: 'Intelligenza', type: 'integer', min: 1, max: 99, default: 50 },
    { key: 'power', label: 'Potenza', type: 'integer', min: 1, max: 99, default: 50 },
  ],
  derived: [
    { key: 'str_half', label: 'Forza (metà)', formula: 'floor(str / 2)' },
    { key: 'str_fifth', label: 'Forza (un quinto)', formula: 'floor(str / 5)' },
    {
      key: 'damage_bonus',
      label: 'Bonus ai danni',
      formula: 'if(str + siz > 164, 2, if(str + siz > 124, 1, 0))',
    },
  ],
  resources: [
    { key: 'hp', label: 'Punti ferita', type: 'pool', maxFormula: 'floor((con + siz) / 10)' },
    { key: 'sanity', label: 'Sanità', type: 'pool', maxFormula: 'power' },
    { key: 'luck', label: 'Fortuna', type: 'pool', max: 99 },
  ],
  lists: [{ key: 'skills', label: 'Abilità', item: { name: 'text', value: 'integer' } }],
  text: [{ key: 'background', label: 'Background' }],
  layout: [
    { section: 'Caratteristiche', fields: ['str', 'con', 'siz', 'dex', 'int', 'power'] },
    { section: 'Soglie', fields: ['str_half', 'str_fifth', 'damage_bonus'] },
    { section: 'Stato', fields: ['hp', 'sanity', 'luck', 'skills', 'background'] },
  ],
};

const dicePool: StatsSchema = {
  schemaVersion: 1,
  name: 'Pool di dadi',
  description:
    'Attributi e abilità come numero di dadi da tirare; ferite e resistenza come risorse.',
  attributes: [
    { key: 'body', label: 'Corpo', type: 'integer', min: 1, max: 6, default: 2 },
    { key: 'agility', label: 'Agilità', type: 'integer', min: 1, max: 6, default: 2 },
    { key: 'mind', label: 'Mente', type: 'integer', min: 1, max: 6, default: 2 },
    { key: 'spirit', label: 'Spirito', type: 'integer', min: 1, max: 6, default: 2 },
  ],
  derived: [
    { key: 'initiative_dice', label: 'Dadi di iniziativa', formula: 'agility + mind' },
    { key: 'soak', label: 'Assorbimento', formula: 'max(1, body - 1)' },
  ],
  resources: [
    { key: 'health', label: 'Salute', type: 'pool', maxFormula: '5 + body * 2' },
    { key: 'willpower', label: 'Forza di volontà', type: 'pool', maxFormula: 'mind + spirit' },
  ],
  lists: [
    { key: 'skills', label: 'Abilità', item: { name: 'text', dice: 'integer' } },
    { key: 'gear', label: 'Equipaggiamento', item: { name: 'text', note: 'text' } },
  ],
  text: [{ key: 'notes', label: 'Note' }],
  layout: [
    { section: 'Attributi', fields: ['body', 'agility', 'mind', 'spirit'] },
    { section: 'Derivati', fields: ['initiative_dice', 'soak', 'health', 'willpower'] },
    { section: 'Dotazione', fields: ['skills', 'gear', 'notes'] },
  ],
};

const narrative: StatsSchema = {
  schemaVersion: 1,
  name: 'Narrativo a tratti',
  description: 'Approcci a livelli, tratti e aspetti descrittivi, punti destino e stress.',
  attributes: [
    { key: 'careful', label: 'Cauto', type: 'integer', min: 0, max: 4, default: 1 },
    { key: 'clever', label: 'Astuto', type: 'integer', min: 0, max: 4, default: 1 },
    { key: 'forceful', label: 'Deciso', type: 'integer', min: 0, max: 4, default: 1 },
    { key: 'sneaky', label: 'Furtivo', type: 'integer', min: 0, max: 4, default: 1 },
  ],
  derived: [
    { key: 'total', label: 'Totale approcci', formula: 'careful + clever + forceful + sneaky' },
  ],
  resources: [
    { key: 'fate', label: 'Punti destino', type: 'pool', max: 5 },
    { key: 'stress', label: 'Stress', type: 'pool', maxFormula: '3 + if(careful >= 3, 1, 0)' },
  ],
  lists: [
    { key: 'traits', label: 'Tratti', item: { name: 'text', description: 'text' } },
    { key: 'stunts', label: 'Prodezze', item: { name: 'text', effect: 'text' } },
  ],
  text: [
    { key: 'concept', label: 'Concetto' },
    { key: 'trouble', label: 'Guaio' },
  ],
  layout: [
    { section: 'Approcci', fields: ['careful', 'clever', 'forceful', 'sneaky', 'total'] },
    { section: 'Risorse', fields: ['fate', 'stress'] },
    { section: 'Aspetti', fields: ['concept', 'trouble', 'traits', 'stunts'] },
  ],
};

export const STATS_PRESETS: readonly StatsPreset[] = [
  { id: 'd20', schema: d20 },
  { id: 'percentile', schema: percentile },
  { id: 'dice-pool', schema: dicePool },
  { id: 'narrative', schema: narrative },
];
