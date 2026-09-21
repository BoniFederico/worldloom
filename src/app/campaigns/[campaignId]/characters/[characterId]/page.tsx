import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { CharacterSheetFields } from '@/components/character-sheet-fields';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { describeChanges } from '@/lib/characters/history';
import { loadStats } from '@/lib/characters/load';
import { readSheet, SHEET_ERROR_CODES, type SheetErrorCode } from '@/lib/characters/sheet';
import { computeSheet } from '@/lib/stats/compute';
import { uuidSchema } from '@/lib/worlds/schemas';
import { deleteCharacter, saveCharacter } from '../actions';

type Props = {
  params: Promise<{ campaignId: string; characterId: string }>;
  searchParams: Promise<{ error?: string; notice?: string; field?: string; code?: string }>;
};

export default async function CharacterPage({ params, searchParams }: Props) {
  const { campaignId, characterId } = await params;
  if (!uuidSchema.safeParse(characterId).success) notFound();
  const { supabase, campaign, canManage } = await loadCampaign(campaignId);
  const [t, format, sp, stats] = await Promise.all([
    getTranslations('Characters'),
    getFormatter(),
    searchParams,
    loadStats(supabase, campaignId),
  ]);

  // La RLS fa sì che un giocatore trovi solo le proprie schede: per le altre la pagina non esiste.
  const { data: character } = await supabase
    .from('characters')
    .select('id, name, kind, owner_id, sheet, notes, rev')
    .eq('id', characterId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (!character) notFound();

  const { data: history } = await supabase
    .from('character_history')
    .select('id, action, changed_by, created_at, changes')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(50);
  const { data: members } = canManage
    ? await supabase.from('campaign_members').select('user_id, role').eq('campaign_id', campaignId)
    : { data: [] };
  const playerIds = (members ?? []).filter((m) => m.role === 'player').map((m) => m.user_id);
  const profileIds = [
    ...new Set([
      ...playerIds,
      ...(character.owner_id ? [character.owner_id] : []),
      ...(history ?? []).flatMap((h) => (h.changed_by ? [h.changed_by] : [])),
    ]),
  ];
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const who = (id: string | null) => (id ? names.get(id) || t('unknownUser') : t('unknownUser'));

  const labels: Record<string, string> = {};
  const columns = new Map<string, string>();
  if (stats) {
    const { schema } = stats.valid;
    for (const f of [
      ...schema.attributes,
      ...schema.derived,
      ...schema.resources,
      ...schema.lists,
      ...schema.text,
    ]) {
      labels[f.key] = f.label;
      columns.set(f.key, f.label);
    }
  }

  // Errore di un valore della scheda: si nomina il campo (solo se esiste nello schema) senza mostrare testo dell'URL.
  const badCode = SHEET_ERROR_CODES.includes(sp.code as SheetErrorCode)
    ? (sp.code as SheetErrorCode)
    : null;
  const badField = sp.field && columns.has(sp.field) ? columns.get(sp.field)! : null;
  const sheetError =
    sp.error === 'invalid_sheet'
      ? badCode && badField
        ? t(`fieldError.${badCode}`, { name: badField })
        : t('invalidSheet')
      : null;

  const sheet = stats ? readSheet(character.sheet, stats.valid) : null;
  const computed = stats && sheet ? computeSheet(stats.valid, sheet.attributes) : null;
  const back = `/campaigns/${campaign.id}/characters`;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={back}>{t('title')}</Link>
        </p>
        <h1>{character.name}</h1>
        <p className="role">
          {t(`kindsShort.${character.kind}`)}
          {character.kind === 'pc' && character.owner_id ? ` · ${who(character.owner_id)}` : ''}
        </p>
        <Feedback
          scope="Characters"
          notice={sp.notice}
          error={sp.error === 'invalid_sheet' ? undefined : sp.error}
        />
        {sheetError ? (
          <p role="alert" className="message message-error">
            {sheetError}
          </p>
        ) : null}

        {stats && sheet && computed ? (
          <form action={saveCharacter} className="form character-form">
            <input type="hidden" name="campaign" value={campaign.id} />
            <input type="hidden" name="id" value={character.id} />
            <input type="hidden" name="rev" value={character.rev} />
            <div className="field">
              <label htmlFor="character-name">{t('name')}</label>
              <input
                id="character-name"
                name="name"
                defaultValue={character.name}
                maxLength={120}
                required
              />
            </div>
            {canManage ? (
              <>
                <div className="field">
                  <label htmlFor="character-kind">{t('kind')}</label>
                  <select id="character-kind" name="kind" defaultValue={character.kind}>
                    <option value="pc">{t('kinds.pc')}</option>
                    <option value="npc">{t('kinds.npc')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="character-owner">{t('owner')}</label>
                  <select id="character-owner" name="owner" defaultValue={character.owner_id ?? ''}>
                    <option value="">{t('noOwner')}</option>
                    {playerIds.map((id) => (
                      <option key={id} value={id}>
                        {who(id)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <CharacterSheetFields valid={stats.valid} sheet={sheet} computed={computed} />

            <div className="field">
              <label htmlFor="character-notes">{t('section.notes')}</label>
              <textarea
                id="character-notes"
                name="notes"
                rows={6}
                maxLength={20000}
                defaultValue={character.notes}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </form>
        ) : (
          <p className="empty">{t('noSchema')}</p>
        )}

        <h2>{t('historyTitle')}</h2>
        {history?.length ? (
          <ol className="visibility-log">
            {history.map((h) => {
              const changes = describeChanges(h.changes, labels);
              return (
                <li key={h.id}>
                  <p>
                    <time dateTime={h.created_at}>
                      {format.dateTime(new Date(h.created_at), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>{' '}
                    —{' '}
                    {h.action === 'create'
                      ? t('created', { who: who(h.changed_by), name: character.name })
                      : t('changed', { who: who(h.changed_by) })}
                  </p>
                  {h.action === 'update' && changes.length ? (
                    <ul className="relation-notes">
                      {changes.map((c, n) => (
                        <li key={n}>
                          {c.type === 'name'
                            ? t('change.name', { from: c.from, to: c.to })
                            : c.type === 'number'
                              ? t('change.number', {
                                  label: c.label,
                                  from: c.from ?? t('change.empty'),
                                  to: c.to ?? t('change.empty'),
                                })
                              : c.type === 'edited'
                                ? t('change.edited', { label: c.label })
                                : t(`change.${c.type}`)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty">{t('historyEmpty')}</p>
        )}

        <h2>{t('deleteTitle')}</h2>
        <form action={deleteCharacter} className="form">
          <input type="hidden" name="campaign" value={campaign.id} />
          <input type="hidden" name="id" value={character.id} />
          <label className="check">
            <input type="checkbox" name="confirm" value="yes" />
            {t('deleteConfirm')}
          </label>
          <button type="submit" className="btn btn-danger">
            {t('delete')}
          </button>
        </form>
      </section>
    </main>
  );
}
