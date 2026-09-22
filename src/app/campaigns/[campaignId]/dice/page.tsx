import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadNames } from '@/lib/sessions/load';
import { loadRolls, loadUsableCharacters, type RollRow } from '@/lib/dice/load';
import type { DieGroup } from '@/lib/dice/roll';
import { createRoll } from './actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const formatGroups = (groups: DieGroup[]) =>
  groups.map((g) => `${g.count}d${g.sides} → [${g.rolls.join(', ')}]`).join(', ');

export default async function DicePage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, canManage } = await loadCampaign(campaignId);
  const [t, format, { error, notice }, rolls, characters] = await Promise.all([
    getTranslations('Dice'),
    getFormatter(),
    searchParams,
    loadRolls(supabase, campaignId),
    loadUsableCharacters(supabase, campaignId),
  ]);
  const names = await loadNames(
    supabase,
    rolls.flatMap((r) => (r.roller_id ? [r.roller_id] : [])),
  );
  const characterName = new Map(characters.map((c) => [c.id, c.name]));
  const who = (id: string | null) => (id ? names.get(id) || t('unknownUser') : t('unknownUser'));

  const describeAttempt = (row: Pick<RollRow, 'groups' | 'total'>) =>
    `${formatGroups(row.groups)} = ${row.total}`;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Dice" notice={notice} error={error} />

        <form action={createRoll} className="form">
          <input type="hidden" name="campaign" value={campaign.id} />
          <div className="field">
            <label htmlFor="roll-notation">{t('notation')}</label>
            <input
              id="roll-notation"
              name="notation"
              defaultValue="1d20"
              maxLength={200}
              required
              autoComplete="off"
              aria-describedby="roll-notation-hint"
            />
            <p className="field-hint" id="roll-notation-hint">
              {t('notationHint')}
            </p>
          </div>
          <div className="form-inline-pair">
            <div className="field">
              <label htmlFor="roll-mode">{t('mode')}</label>
              <select id="roll-mode" name="mode" defaultValue="normal">
                <option value="normal">{t('modes.normal')}</option>
                <option value="advantage">{t('modes.advantage')}</option>
                <option value="disadvantage">{t('modes.disadvantage')}</option>
              </select>
            </div>
            {characters.length ? (
              <div className="field">
                <label htmlFor="roll-character">{t('character')}</label>
                <select id="roll-character" name="character" defaultValue="">
                  <option value="">{t('noCharacter')}</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="roll-label">{t('label')}</label>
            <input id="roll-label" name="label" maxLength={120} autoComplete="off" />
          </div>
          {canManage ? (
            <label className="check">
              <input type="checkbox" name="private" />
              {t('private')}
            </label>
          ) : null}
          <button type="submit" className="btn btn-primary">
            {t('roll')}
          </button>
        </form>

        <h2>{t('historyTitle')}</h2>
        {rolls.length === 0 ? (
          <p className="empty">{t('empty')}</p>
        ) : (
          <ol className="chronicle-list">
            {rolls.map((r) => (
              <li key={r.id}>
                <p className="role">
                  {who(r.roller_id)}
                  {r.character_id
                    ? ` (${characterName.get(r.character_id) ?? t('unknownCharacter')})`
                    : ''}
                  {' — '}
                  <time dateTime={r.created_at}>
                    {format.dateTime(new Date(r.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  {r.is_private ? <span className="role"> · {t('privateTag')}</span> : null}
                </p>
                <p>
                  {r.label ? <strong>{r.label}: </strong> : null}
                  {r.notation}
                  {r.mode !== 'normal' ? ` (${t(`modes.${r.mode}`)})` : ''}
                </p>
                <p className="field-hint">{describeAttempt(r)}</p>
                <p>
                  {t('total')}: <strong>{r.total}</strong>
                </p>
                {r.other ? (
                  <p className="field-hint">
                    {t('discarded')}: {describeAttempt(r.other)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
