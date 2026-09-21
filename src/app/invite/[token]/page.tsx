import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { acceptInvite } from '../../campaigns/actions';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

/**
 * Apertura di un invito. Mostra nome e ruolo solo se l'invito vale per chi guarda (altrimenti un messaggio unico), e
 * l'adesione è un'azione esplicita (POST), mai un effetto dell'apertura del link.
 */
export default async function InvitePage({ params, searchParams }: Props) {
  const [{ token }, { error }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('Campaigns'),
  ]);
  const supabase = await createClient();
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data } = valid
    ? await supabase.rpc('preview_campaign_invite', { p_token: token })
    : { data: null };
  const invite = data?.[0];

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{t('inviteTitle')}</h1>
        <Feedback scope="Campaigns" error={error} />
        {invite ? (
          <>
            <p className="lead">
              {t('invitePrompt', { name: invite.campaign_name, role: t(`roles.${invite.role}`) })}
            </p>
            {invite.already_member ? (
              <p className="message message-info">{t('errors.already_member')}</p>
            ) : (
              <form action={acceptInvite} className="form">
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="btn btn-primary">
                  {t('accept')}
                </button>
              </form>
            )}
          </>
        ) : (
          <p role="alert" className="message message-error">
            {t('errors.invalid_invite')}
          </p>
        )}
        <p>
          <Link href="/campaigns">{t('title')}</Link>
        </p>
      </section>
    </main>
  );
}
