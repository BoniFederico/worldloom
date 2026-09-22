import { readSheet } from '@/lib/characters/sheet';
import { loadStats } from '@/lib/characters/load';
import { computeSheet } from '@/lib/stats/compute';
import type { createClient } from '@/lib/supabase/server';
import type { DiceMode, DieGroup } from './roll';

type Client = Awaited<ReturnType<typeof createClient>>;

export type RollRow = {
  id: string;
  roller_id: string | null;
  character_id: string | null;
  label: string;
  notation: string;
  mode: string;
  total: number;
  groups: DieGroup[];
  other: { total: number; groups: DieGroup[] } | null;
  is_private: boolean;
  created_at: string;
};

/** Storico dei tiri di una campagna, più recenti prima; la RLS nasconde i tiri privati altrui. */
export async function loadRolls(supabase: Client, campaignId: string): Promise<RollRow[]> {
  const { data } = await supabase
    .from('campaign_dice_rolls')
    .select(
      'id, roller_id, character_id, label, notation, mode, total, groups, other, is_private, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as RollRow[];
}

export type CharacterOption = { id: string; name: string };

/** Personaggi utilizzabili da chi guarda in una formula di tiro: i propri PG, o tutti se gestisce la campagna (la RLS filtra). */
export async function loadUsableCharacters(
  supabase: Client,
  campaignId: string,
): Promise<CharacterOption[]> {
  const { data } = await supabase
    .from('characters')
    .select('id, name')
    .eq('campaign_id', campaignId)
    .order('name');
  return data ?? [];
}

/** Attributi e derivati di un personaggio, come variabili disponibili in una formula di tiro (es. `str_mod`). */
export async function characterScope(
  supabase: Client,
  campaignId: string,
  characterId: string,
): Promise<Record<string, number>> {
  const [stats, { data: character }] = await Promise.all([
    loadStats(supabase, campaignId),
    supabase
      .from('characters')
      .select('sheet')
      .eq('id', characterId)
      .eq('campaign_id', campaignId)
      .maybeSingle(),
  ]);
  if (!stats || !character) return {};
  const sheet = readSheet(character.sheet, stats.valid);
  const computed = computeSheet(stats.valid, sheet.attributes);
  const scope: Record<string, number> = { ...computed.attributes };
  for (const [key, value] of Object.entries(computed.derived)) {
    if (value !== null) scope[key] = value;
  }
  return scope;
}

export type { DiceMode };
