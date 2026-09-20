import { CommandPalette } from '@/components/command-palette';
import { uuidSchema } from '@/lib/worlds/schemas';

type Props = { children: React.ReactNode; params: Promise<{ worldId: string }> };

/** Pagine di un mondo: aggiunge il comando rapido di ricerca (Ctrl/Cmd+K). Le pagine verificano da sole l'accesso. */
export default async function WorldLayout({ children, params }: Props) {
  const { worldId } = await params;
  return (
    <>
      {uuidSchema.safeParse(worldId).success ? <CommandPalette worldId={worldId} /> : null}
      {children}
    </>
  );
}
