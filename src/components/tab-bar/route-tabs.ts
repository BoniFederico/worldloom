import {
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Columns3,
  FileText,
  GitBranch,
  GitFork,
  History,
  LayoutDashboard,
  Map,
  Search,
  Settings,
  Shapes,
  Share2,
  Table2,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type TabKey =
  | 'dashboard'
  | 'snippets'
  | 'snippetDetail'
  | 'snippetHistory'
  | 'categories'
  | 'relationTypes'
  | 'table'
  | 'graph'
  | 'timeline'
  | 'maps'
  | 'tree'
  | 'kanban'
  | 'views'
  | 'search'
  | 'members'
  | 'settings'
  | 'coherence'
  | 'calendars';

export const TAB_ICON: Record<TabKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  snippets: FileText,
  snippetDetail: FileText,
  snippetHistory: History,
  categories: Shapes,
  relationTypes: GitBranch,
  table: Table2,
  graph: Share2,
  timeline: Clock,
  maps: Map,
  tree: GitFork,
  kanban: Columns3,
  views: Bookmark,
  search: Search,
  members: Users,
  settings: Settings,
  coherence: CheckCircle2,
  calendars: Calendar,
};

/**
 * Deriva il tipo di scheda dal percorso relativo al mondo (D-052, #112). Restituisce `null` per i percorsi che
 * non devono aprire una scheda (es. sotto-percorsi non riconosciuti): meglio nessuna scheda che una sbagliata.
 */
export function tabKeyFor(relativePath: string): TabKey | null {
  const segments = relativePath.split('/').filter(Boolean);
  const [first, second, third] = segments;
  if (!first) return 'dashboard';
  if (first === 'snippets') {
    if (!second) return 'snippets';
    if (second && third === 'history') return 'snippetHistory';
    if (second) return 'snippetDetail';
  }
  if (first === 'categories') return 'categories';
  if (first === 'relation-types') return 'relationTypes';
  if (first === 'table') return 'table';
  if (first === 'graph') return 'graph';
  if (first === 'timeline') return 'timeline';
  if (first === 'maps') return 'maps';
  if (first === 'tree') return 'tree';
  if (first === 'kanban') return 'kanban';
  if (first === 'views') return 'views';
  if (first === 'search') return 'search';
  if (first === 'members') return 'members';
  if (first === 'settings') return 'settings';
  if (first === 'coherence') return 'coherence';
  if (first === 'calendars') return 'calendars';
  return null;
}
