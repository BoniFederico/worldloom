import type { createClient } from '@/lib/supabase/server';
import { calendarSchema, type Calendar } from './calendar';

type Client = Awaited<ReturnType<typeof createClient>>;

export type NamedCalendar = { id: string; name: string; calendar: Calendar };

/** Calendari del mondo (con i permessi di chi legge). Le definizioni non valide si ignorano invece di rompere la pagina. */
export async function loadCalendars(supabase: Client, worldId: string): Promise<NamedCalendar[]> {
  const { data } = await supabase
    .from('calendars')
    .select('id, name, definition')
    .eq('world_id', worldId)
    .order('name');
  const out: NamedCalendar[] = [];
  for (const row of data ?? []) {
    const parsed = calendarSchema.safeParse(row.definition);
    if (parsed.success) out.push({ id: row.id, name: row.name, calendar: parsed.data });
  }
  return out;
}
