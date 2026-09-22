import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { loadCoherenceReport, type RelationFinding } from '@/lib/coherence/load';
import { loadWorld } from '@/lib/worlds/context';

type Props = { params: Promise<{ worldId: string }> };

export default async function CoherencePage({ params }: Props) {
  const { worldId } = await params;
  const { supabase, world } = await loadWorld(worldId);
  const [t, report] = await Promise.all([
    getTranslations('Coherence'),
    loadCoherenceReport(supabase, worldId),
  ]);

  const relationList = (findings: RelationFinding[], emptyKey: string, id: string) =>
    findings.length === 0 ? (
      <p className="empty">{t(emptyKey)}</p>
    ) : (
      <ul id={id} className="sessions-list">
        {findings.map((f) => (
          <li key={f.id}>
            <Link href={`/worlds/${world.id}/snippets/${f.sourceId}`}>{f.sourceTitle}</Link>
            {' — '}
            <span className="role">{f.label}</span>
            {' → '}
            <Link href={`/worlds/${world.id}/snippets/${f.targetId}`}>{f.targetTitle}</Link>
          </li>
        ))}
      </ul>
    );

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        {report.truncated ? <p className="field-hint">{t('truncated')}</p> : null}

        <h2>{t('temporalTitle')}</h2>
        <p className="field-hint">{t('temporalHint')}</p>
        {relationList(report.temporal, 'temporalEmpty', 'temporal-findings')}

        <h2>{t('missingInverseTitle')}</h2>
        <p className="field-hint">{t('missingInverseHint')}</p>
        {relationList(report.missingInverse, 'missingInverseEmpty', 'missing-inverse-findings')}

        <h2>{t('orphansTitle')}</h2>
        <p className="field-hint">{t('orphansHint')}</p>
        {report.orphans.length === 0 ? (
          <p className="empty">{t('orphansEmpty')}</p>
        ) : (
          <ul id="orphan-findings" className="sessions-list">
            {report.orphans.map((o) => (
              <li key={o.id}>
                <Link href={`/worlds/${world.id}/snippets/${o.id}`}>{o.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
