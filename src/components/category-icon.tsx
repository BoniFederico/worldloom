import {
  BookOpen,
  CalendarDays,
  Castle,
  Compass,
  Crown,
  Feather,
  Flag,
  Flame,
  Gem,
  KeyRound,
  Landmark,
  MapPin,
  Mountain,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trees,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryIcon as IconName } from '@/lib/categories/catalog';

// Import espliciti (non `icons`): nel bundle entrano solo le icone selezionabili.
const ICONS: Record<IconName, LucideIcon> = {
  user: User,
  'map-pin': MapPin,
  'calendar-days': CalendarDays,
  'book-open': BookOpen,
  gem: Gem,
  flag: Flag,
  'scroll-text': ScrollText,
  swords: Swords,
  crown: Crown,
  castle: Castle,
  mountain: Mountain,
  trees: Trees,
  feather: Feather,
  sparkles: Sparkles,
  landmark: Landmark,
  compass: Compass,
  skull: Skull,
  flame: Flame,
  'key-round': KeyRound,
  shield: Shield,
};

type Props = { icon: string; color: string; size?: number };

/** Icona di categoria nel suo colore. Decorativa: il nome della categoria è sempre presente accanto. */
export function CategoryBadge({ icon, color, size = 18 }: Props) {
  const Icon = ICONS[icon as IconName] ?? Compass;
  return (
    <span className="cat-badge" data-color={color}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
