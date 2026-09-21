import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CharacterSheetFields } from '@/components/character-sheet-fields';
import { Feedback } from '@/components/feedback';
import { StatsEditor } from '@/components/stats-editor';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadStats } from '@/lib/characters/load';
import { readSheet } from '@/lib/characters/sheet';
import { computeSheet } from '@/lib/stats/compute';
import { STATS_PRESETS } from '@/lib/stats/presets';
import { applyPreset } from './actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function StatsPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, role } = await loadCampaign(campaignId);
  const [t, { error, notice }, stats] = await Promise.all([
    getTranslations('Stats'),
    searchParams,
    loadStats(supabase, campaignId),
  ]);
  const isDm = role === 'dm';
  const initialText = JSON.stringify(stats?.valid.schema ?? STATS_PRESETS[0]!.schema, null, 2);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Stats" notice={notice} error={error} />

        {isDm ? (
          <>
            <h2>{t('presetsTitle')}</h2>
            <p className="field-hint">{t('presetsHint')}</p>
            <ul className="presets-list">
              {STATS_PRESETS.map((p) => (
                <li key={p.id}>
                  <form action={applyPreset} className="row-form">
                    <input type="hidden" name="campaign" value={campaign.id} />
                    <input type="hidden" name="preset" value={p.id} />
                    <div>
                      <strong>{t(`presets.${p.id}`)}</strong>
                      <p className="field-hint">{t(`presetHints.${p.id}`)}</p>
                    </div>
                    <button type="submit" className="btn">
                      {t('usePreset', { name: t(`presets.${p.id}`) })}
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <h2>{t('schemaLabel')}</h2>
            <p className="field-hint">{t('docs')}</p>
            <StatsEditor campaignId={campaign.id} initialText={initialText} />

            <h2>{t('resetTitle')}</h2>
            <form action={applyPreset} className="row-form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="reset" value="1" />
              <p className="field-hint">{t('resetHint')}</p>
              <button type="submit" className="btn">
                {t('reset')}
              </button>
            </form>
          </>
        ) : (
          <p className="field-hint">{t('readOnly')}</p>
        )}

        <h2>{t('previewTitle')}</h2>
        {stats ? (
          <>
            <p className="field-hint">{t('previewHint')}</p>
            <div className="sheet-preview">
              <CharacterSheetFields
                valid={stats.valid}
                sheet={readSheet({}, stats.valid)}
                computed={computeSheet(stats.valid, {})}
                readOnly
                idPrefix="preview"
              />
            </div>
          </>
        ) : (
          <p className="empty">{t('noSchema')}</p>
        )}
      </section>
    </main>
  );
}
