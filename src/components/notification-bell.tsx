import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { countUnreadNotifications } from '@/lib/notifications/load';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

/** Campanella con il numero di notifiche non lette. Il chiamante decide se mostrarla (solo chi ha effettuato l'accesso). */
export async function NotificationBell({ supabase }: { supabase: Client }) {
  const [t, unread] = await Promise.all([
    getTranslations('Shell'),
    countUnreadNotifications(supabase),
  ]);
  return (
    <Link
      href="/notifications"
      className="app-nav-link notification-bell"
      aria-label={t('notifications')}
    >
      <Bell size={20} aria-hidden="true" />
      {unread > 0 ? (
        <span className="badge" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
