import { listMentionTargets } from '@/app/worlds/[worldId]/snippets/actions';
import {
  suggestMentions,
  type MentionCandidate,
  type MentionSuggestion,
} from '@/lib/snippets/mentions';

export type MentionState = {
  items: MentionSuggestion[];
  index: number;
  command: (item: MentionSuggestion) => void;
  top: number;
  left: number;
};

type SuggestionProps = {
  items: MentionSuggestion[];
  command: (attrs: { id: string; label: string }) => void;
  clientRect?: (() => DOMRect | null) | null;
};

/**
 * Suggerimenti per `@` nell'editor. Gli snippet menzionabili si caricano alla prima `@` e si filtrano in locale;
 * lo stato dell'elenco (voci, selezione, posizione) passa a `onChange` per essere mostrato dal componente.
 */
export function createMentionController(
  scope: { worldId: string; snippetId: string },
  onChange: (state: MentionState | null) => void,
) {
  let targets: Promise<MentionCandidate[]> | null = null;
  let current: MentionState | null = null;

  const load = () => {
    targets ??= listMentionTargets({ world: scope.worldId, id: scope.snippetId }).catch(() => []);
    return targets;
  };
  const show = (next: MentionState | null) => {
    current = next;
    onChange(next);
  };

  return {
    items: async ({ query }: { query: string }) => suggestMentions(await load(), query),
    render: () => {
      const open = (props: SuggestionProps) => {
        const rect = props.clientRect?.();
        show({
          items: props.items,
          index: 0,
          command: (item) => props.command({ id: item.id, label: item.title }),
          top: rect ? rect.bottom + 4 : 0,
          left: rect ? rect.left : 0,
        });
      };
      return {
        onStart: open,
        onUpdate: open,
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (!current) return false;
          const count = current.items.length;
          if (event.key === 'Escape') {
            show(null);
            return true;
          }
          if (count === 0) return false;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const step = event.key === 'ArrowDown' ? 1 : -1;
            show({ ...current, index: (current.index + step + count) % count });
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = current.items[current.index];
            if (item) current.command(item);
            return true;
          }
          return false;
        },
        onExit: () => show(null),
      };
    },
  };
}
