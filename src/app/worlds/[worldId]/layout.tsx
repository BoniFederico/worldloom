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
      {/* `body` è una grid a due righe (header/contenuto, D-010): senza un unico contenitore qui, ogni figlio
          diretto (compreso il bottone della ricerca rapida, fratello del <dialog> in CommandPalette) diventerebbe
          una riga a sé, e la riga 1fr finirebbe a uno qualunque di loro invece che al contenuto — lasciando un
          vuoto sopra la barra di schede nelle pagine con poco contenuto (bug preesistente da #112, trovato nella
          passata finale #113). */}
      <div className="world-shell">
        <CommandPalette worldId={worldId} />
        <TabBar />
        {children}
      </div>
    </TabBarProvider>
  );
}
