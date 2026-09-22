import { getFormatter, getTranslations } from 'next-intl/server';
import type { createClient } from '@/lib/supabase/server';
import { createComment, deleteComment } from '@/app/worlds/[worldId]/snippets/comment-actions';
import { CommentsLive } from './comments-live';

type Props = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  worldId: string;
  snippetId: string;
  userId: string;
  canModerate: boolean;
};

const LIMIT = 200;

/** Commenti su uno snippet: li scrive chiunque lo veda (anche un lettore), si aggiornano da soli quando ne arriva
 * uno nuovo (Realtime), senza bisogno di ricaricare la pagina. */
export async function CommentsPanel({ supabase, worldId, snippetId, userId, canModerate }: Props) {
  const [t, format] = await Promise.all([getTranslations('Comments'), getFormatter()]);
  const { data: rows } = await supabase
    .from('snippet_comments')
    .select('id, author, body, created_at')
    .eq('snippet_id', snippetId)
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  const comments = rows ?? [];
  const authorIds = [...new Set(comments.map((c) => c.author).filter((id): id is string => !!id))];
  const { data: profiles } = authorIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', authorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <section aria-labelledby="comments">
      <h2 id="comments">{t('title')}</h2>
      <CommentsLive snippetId={snippetId} />
      {comments.length === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id}>
              <p>
                <strong>
                  {c.author ? (names.get(c.author) ?? t('unknownUser')) : t('unknownUser')}
                </strong>{' '}
                <time className="role" dateTime={c.created_at}>
                  {format.dateTime(new Date(c.created_at), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </p>
              <p>{c.body}</p>
              {c.author === userId || canModerate ? (
                <form action={deleteComment}>
                  <input type="hidden" name="world" value={worldId} />
                  <input type="hidden" name="snippet" value={snippetId} />
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="btn">
                    {t('delete')}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form action={createComment}>
        <input type="hidden" name="world" value={worldId} />
        <input type="hidden" name="snippet" value={snippetId} />
        <div className="field">
          <label htmlFor="comment-body">{t('newComment')}</label>
          <textarea id="comment-body" name="body" rows={3} maxLength={2000} required />
        </div>
        <button type="submit" className="btn">
          {t('post')}
        </button>
      </form>
    </section>
  );
}
