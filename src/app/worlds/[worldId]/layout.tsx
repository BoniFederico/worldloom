import { CommandPalette } from '@/components/command-palette';
import { TabBar } from '@/components/tab-bar/tab-bar';
import { TabBarProvider } from '@/components/tab-bar/tab-bar-context';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

type Props = { children: React.ReactNode; params: Promise<{ worldId: string }> };

/**
 * Pagine di un mondo: aggiunge il comando rapido di ricerca (Ctrl/Cmd+K) e la barra di schede (D-052, #112).
 * Le pagine verificano da sole l'accesso. Lo `userId` (stesso pattern di `AppHeader`) tiene le schede separate
 * per utente in `localStorage`, così un titolo riservato letto da un GM non resta visibile a un giocatore che
 * usi lo stesso browser (D-055).
 */
export default async function WorldLayout({ children, params }: Props) {
  const { worldId } = await params;
  const validId = uuidSchema.safeParse(worldId).success;
  if (!validId) return children;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (!userId) return children;
  return (
    <TabBarProvider worldId={worldId} userId={userId}>
      <CommandPalette worldId={worldId} />
      <TabBar />
      {children}
    </TabBarProvider>
  );
}
