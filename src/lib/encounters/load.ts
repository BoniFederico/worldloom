import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type EncounterRow = {
  id: string;
  name: string;
  round: number;
  turn_index: number;
  created_at: string;
  updated_at: string;
};

/** Scontri di una campagna, più recenti prima; la RLS decide chi li vede (ogni membro). */
export async function loadEncounters(
  supabase: Client,
  campaignId: string,
): Promise<EncounterRow[]> {
  const { data } = await supabase
    .from('campaign_encounters')
    .select('id, name, round, turn_index, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Uno scontro, verificando che appartenga alla campagna indicata (altrimenti `null`, come un id inesistente). */
export async function loadEncounter(
  supabase: Client,
  campaignId: string,
  encounterId: string,
): Promise<EncounterRow | null> {
  const { data } = await supabase
    .from('campaign_encounters')
    .select('id, name, round, turn_index, created_at, updated_at')
    .eq('id', encounterId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return data;
}

export type ParticipantRow = {
  id: string;
  character_id: string | null;
  name: string;
  initiative: number;
  hp_current: number | null;
  hp_max: number | null;
  resource_label: string;
  conditions: string[];
  created_at: string;
};

/** Partecipanti di uno scontro, in nessun ordine particolare: l'ordine di iniziativa si calcola a parte (turn.ts). */
export async function loadParticipants(
  supabase: Client,
  encounterId: string,
): Promise<ParticipantRow[]> {
  const { data } = await supabase
    .from('encounter_participants')
    .select(
      'id, character_id, name, initiative, hp_current, hp_max, resource_label, conditions, created_at',
    )
    .eq('encounter_id', encounterId);
  return (data ?? []) as ParticipantRow[];
}
