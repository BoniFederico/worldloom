import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadNames, loadPosts } from '@/lib/sessions/load';
import { createPost, deletePost } from '../sessions/actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ChroniclePage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, role, userId, canManage } = await loadCampaign(campaignId);
  const [t, format, { error, notice }, posts] = await Promise.all([
    getTranslations('Chronicle'),
    getFormatter(),
    searchParams,
    loadPosts(supabase, campaignId, 'chronicle'),
  ]);
  const names = await loadNames(
    supabase,
    posts.flatMap((p) => (p.author ? [p.author] : [])),
  );
  const who = (id: string | null) => (id ? names.get(id) || t('unknownUser') : t('unknownUser'));
  const canWrite = role !== 'observer';

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Chronicle" notice={notice} error={error} />

        {canWrite ? (
          <form action={createPost} className="form">
            <input type="hidden" name="campaign" value={campaign.id} />
            <input type="hidden" name="kind" value="chronicle" />
            <div className="field">
              <label htmlFor="chronicle-body">{t('newEntry')}</label>
              <textarea id="chronicle-body" name="body" rows={5} maxLength={5000} required />
            </div>
            <button type="submit" className="btn btn-primary">
              {t('post')}
            </button>
          </form>
        ) : null}

        {posts.length ? (
          <ol className="chronicle-list">
            {posts.map((p) => (
              <li key={p.id}>
                <p className="role">
                  {who(p.author)} —{' '}
                  <time dateTime={p.created_at}>
                    {format.dateTime(new Date(p.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </p>
                <p>{p.body}</p>
                {p.author === userId || canManage ? (
                  <form action={deletePost}>
                    <input type="hidden" name="campaign" value={campaign.id} />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="kind" value="chronicle" />
                    <button type="submit" className="btn btn-danger">
                      {t('delete')}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}
      </section>
    </main>
  );
}
