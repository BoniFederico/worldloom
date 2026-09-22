import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadUsableCharacters } from '@/lib/dice/load';
import { loadEncounter, loadParticipants } from '@/lib/encounters/load';
import { currentTurnIndex, orderByInitiative } from '@/lib/encounters/turn';
import { uuidSchema } from '@/lib/worlds/schemas';
import {
  addParticipant,
  deleteEncounter,
  nextTurn,
  removeParticipant,
  updateParticipant,
} from '../actions';

type Props = {
  params: Promise<{ campaignId: string; encounterId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function EncounterPage({ params, searchParams }: Props) {
  const { campaignId, encounterId } = await params;
  if (!uuidSchema.safeParse(encounterId).success) notFound();
  const { supabase, campaign, canManage } = await loadCampaign(campaignId);
  const [t, { error, notice }, encounter, participants, characters] = await Promise.all([
    getTranslations('Encounters'),
    searchParams,
    loadEncounter(supabase, campaignId, encounterId),
    loadParticipants(supabase, encounterId),
    canManage ? loadUsableCharacters(supabase, campaignId) : Promise.resolve([]),
  ]);
  if (!encounter) notFound();

  const ordered = orderByInitiative(participants);
  const turn = currentTurnIndex(ordered.length, encounter.turn_index);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
          {' · '}
          <Link href={`/campaigns/${campaign.id}/encounters`}>{t('title')}</Link>
        </p>
        <h1>{encounter.name || t('unnamed')}</h1>
        <Feedback scope="Encounters" notice={notice} error={error} />

        <p className="lead">{t('roundTurn', { round: encounter.round })}</p>

        {canManage ? (
          <form action={nextTurn} className="form-inline">
            <input type="hidden" name="campaign" value={campaign.id} />
            <input type="hidden" name="encounter" value={encounter.id} />
            <button type="submit" className="btn btn-primary btn-large">
              {t('nextTurn')}
            </button>
          </form>
        ) : null}

        {ordered.length === 0 ? (
          <p className="empty">{t('noParticipants')}</p>
        ) : (
          <ol className="encounter-list">
            {ordered.map((p, i) => (
              <li key={p.id} className={i === turn ? 'encounter-current' : undefined}>
                <p className="role">
                  {i === turn ? <strong>{t('yourTurn')} </strong> : null}
                  {p.name} · {t('initiativeOf', { value: p.initiative })}
                </p>
                {p.hp_max !== null || p.hp_current !== null ? (
                  <p>
                    {p.resource_label || t('hp')}: {p.hp_current ?? '—'} / {p.hp_max ?? '—'}
                  </p>
                ) : null}
                {p.conditions.length ? (
                  <p className="field-hint">{p.conditions.join(', ')}</p>
                ) : null}

                {canManage ? (
                  <form action={updateParticipant} className="form form-inline">
                    <input type="hidden" name="campaign" value={campaign.id} />
                    <input type="hidden" name="encounter" value={encounter.id} />
                    <input type="hidden" name="id" value={p.id} />
                    <div className="field">
                      <label htmlFor={`initiative-${p.id}`}>{t('initiative')}</label>
                      <input
                        id={`initiative-${p.id}`}
                        name="initiative"
                        type="number"
                        step="any"
                        defaultValue={p.initiative}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`hp-current-${p.id}`}>{t('hpCurrent')}</label>
                      <input
                        id={`hp-current-${p.id}`}
                        name="hp_current"
                        type="number"
                        min={0}
                        defaultValue={p.hp_current ?? ''}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`hp-max-${p.id}`}>{t('hpMax')}</label>
                      <input
                        id={`hp-max-${p.id}`}
                        name="hp_max"
                        type="number"
                        min={0}
                        defaultValue={p.hp_max ?? ''}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`conditions-${p.id}`}>{t('conditions')}</label>
                      <input
                        id={`conditions-${p.id}`}
                        name="conditions"
                        defaultValue={p.conditions.join(', ')}
                        autoComplete="off"
                      />
                    </div>
                    <button type="submit" className="btn">
                      {t('save')}
                    </button>
                  </form>
                ) : null}
                {canManage ? (
                  <form action={removeParticipant}>
                    <input type="hidden" name="campaign" value={campaign.id} />
                    <input type="hidden" name="encounter" value={encounter.id} />
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="btn btn-danger">
                      {t('remove')}
                      <span className="sr-only"> {p.name}</span>
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {canManage ? (
          <>
            <h2>{t('addTitle')}</h2>
            <form id="add-participant-form" action={addParticipant} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="encounter" value={encounter.id} />
              {characters.length ? (
                <div className="field">
                  <label htmlFor="participant-character">{t('character')}</label>
                  <select id="participant-character" name="character" defaultValue="">
                    <option value="">{t('noCharacter')}</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="participant-name">{t('participantName')}</label>
                <input
                  id="participant-name"
                  name="name"
                  maxLength={120}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="form-inline-pair">
                <div className="field">
                  <label htmlFor="participant-initiative">{t('initiative')}</label>
                  <input
                    id="participant-initiative"
                    name="initiative"
                    type="number"
                    step="any"
                    defaultValue={10}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="participant-resource-label">{t('resourceLabel')}</label>
                  <input
                    id="participant-resource-label"
                    name="resource_label"
                    maxLength={40}
                    autoComplete="off"
                    placeholder={t('hp')}
                  />
                </div>
              </div>
              <div className="form-inline-pair">
                <div className="field">
                  <label htmlFor="participant-hp-current">{t('hpCurrent')}</label>
                  <input id="participant-hp-current" name="hp_current" type="number" min={0} />
                </div>
                <div className="field">
                  <label htmlFor="participant-hp-max">{t('hpMax')}</label>
                  <input id="participant-hp-max" name="hp_max" type="number" min={0} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                {t('add')}
              </button>
            </form>

            <h2>{t('deleteTitle')}</h2>
            <form action={deleteEncounter} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="id" value={encounter.id} />
              <label className="check">
                <input type="checkbox" name="confirm" />
                {t('confirmDelete')}
              </label>
              <button type="submit" className="btn btn-danger">
                {t('delete')}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
