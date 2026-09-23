import { CommandPalette } from '@/components/command-palette';
import { TabBar } from '@/components/tab-bar/tab-bar';
import { TabBarProvider } from '@/components/tab-bar/tab-bar-context';
import { uuidSchema } from '@/lib/worlds/schemas';

type Props = { children: React.ReactNode; params: Promise<{ worldId: string }> };

/**
 * Pagine di un mondo: aggiunge il comando rapido di ricerca (Ctrl/Cmd+K) e la barra di schede (D-052, #112).
 * Le pagine verificano da sole l'accesso.
 */
export default async function WorldLayout({ children, params }: Props) {
  const { worldId } = await params;
  const validId = uuidSchema.safeParse(worldId).success;
  if (!validId) return children;
  return (
    <TabBarProvider worldId={worldId}>
      <CommandPalette worldId={worldId} />
      <TabBar />
      {children}
    </TabBarProvider>
  );
}
