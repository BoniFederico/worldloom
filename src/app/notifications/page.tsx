import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { markAllNotificationsRead, markNotificationRead } from './actions';
import { describeNotification } from '@/lib/notifications/display';
import { loadNotificationContext, loadNotifications } from '@/lib/notifications/load';
import { createClient } from '@/lib/supabase/server';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const [t, tv, tc, format, rows] = await Promise.all([
    getTranslations('Notifications'),
    getTranslations('Visibility'),
    getTranslations('Campaigns'),
    getFormatter(),
    loadNotifications(supabase),
  ]);
  const ctx = await loadNotificationContext(supabase, rows);
  const unread = rows.filter((r) => !r.read_at).length;

  const levelLabel = (level: string) => (tv.has(`levels.${level}`) ? tv(`levels.${level}`) : level);
  const kindLabel = (kind: string) => (t.has(`kinds.${kind}`) ? t(`kinds.${kind}`) : kind);
  const roleLabel = (role: string) => (tc.has(`roles.${role}`) ? tc(`roles.${role}`) : role);

  return (
    <main id="main">
      <h1>
        <Bell size={24} aria-hidden="true" /> {t('title')}
      </h1>
      {unread > 0 ? (
        <form action={markAllNotificationsRead}>
          <button type="submit" className="btn">
            {t('markAllRead')}
          </button>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <ol className="notifications-list">
          {rows.map((row) => {
            const d = describeNotification(row, ctx);
            const params: Record<string, string | number> = { ...d.params };
            if ('level' in params) params.level = levelLabel(String(params.level));
            if ('kind' in params) params.kind = kindLabel(String(params.kind));
            if ('role' in params) params.role = roleLabel(String(params.role));
            const text = t(`items.${d.key}`, params);
            return (
              <li key={row.id} className={row.read_at ? 'read' : 'unread'}>
                <p>
                  {d.href ? <Link href={d.href}>{text}</Link> : text}
                  {!row.read_at ? <strong className="badge"> {t('unreadBadge')}</strong> : null}
                </p>
                <p className="role">
                  <time dateTime={row.created_at}>
                    {format.dateTime(new Date(row.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </p>
                {!row.read_at ? (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" className="btn">
                      {t('markRead')}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
