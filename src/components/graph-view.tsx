import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { GraphData } from '@/lib/graph/load';
import { graphSize, layoutGraph } from '@/lib/graph/layout';

// Colori ammessi per le categorie (stessi token del design system); qualsiasi altro valore ricade sul colore primario.
const COLORS = new Set(['teal', 'brass', 'moss', 'rust', 'slate', 'plum', 'ocean', 'rose']);

type Props = {
  worldId: string;
  graph: GraphData;
  center: string | null;
  categories: { id: string; name: string; color: string | null }[];
  /** Indirizzo che ricentra il grafo su un nodo (un normale link: funziona da tastiera e senza JavaScript). */
  nodeHref: (id: string) => string;
};

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Grafo disegnato sul server come SVG (nessuna libreria nel browser): ogni nodo è un link che ricentra il grafo, quindi
 * si naviga da tastiera. L'alternativa accessibile è la tabella delle relazioni sotto il disegno, con gli stessi dati.
 */
export async function GraphView({ worldId, graph, center, categories, nodeHref }: Props) {
  const t = await getTranslations('Graph');
  const size = graphSize(graph.nodes.length);
  const positions = layoutGraph(graph.nodes, graph.edges, size, { pinned: center ?? undefined });
  const byCategory = new Map(categories.map((c) => [c.id, c]));
  const title = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const colorOf = (categoryIds: string[]) => {
    const c = byCategory.get(categoryIds[0] ?? '');
    return c?.color && COLORS.has(c.color) ? `var(--cat-${c.color})` : 'var(--primary)';
  };
  const showEdgeLabels = graph.edges.length <= 30;
  const used = categories.filter((c) => graph.nodes.some((n) => n.category_ids.includes(c.id)));

  return (
    <div>
      <p className="role" aria-live="polite">
        {t('count', { nodes: graph.nodes.length, edges: graph.edges.length })}
      </p>
      {graph.truncated ? (
        <p className="message message-info">{t('truncated', { count: graph.nodes.length })}</p>
      ) : null}
      {graph.nodes.length === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <>
          <div className="graph-scroll" tabIndex={0} role="region" aria-label={t('graphScroll')}>
            <svg
              className="graph"
              viewBox={`0 0 ${size.width} ${size.height}`}
              style={
                size.width > 960 ? { minWidth: `${Math.round(size.width * 0.6)}px` } : undefined
              }
              role="group"
              aria-labelledby="graph-title graph-desc"
            >
              <title id="graph-title">{t('svgTitle')}</title>
              <desc id="graph-desc">{t('svgDesc')}</desc>
              <g className="graph-edges">
                {graph.edges.map((e, i) => {
                  const a = positions.get(e.source);
                  const b = positions.get(e.target);
                  if (!a || !b) return null;
                  return (
                    <g key={i}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className={e.from_mention ? 'graph-edge graph-edge-mention' : 'graph-edge'}
                      >
                        <title>{`${title.get(e.source)} — ${e.from_mention ? t('mention') : e.label} — ${title.get(e.target)}`}</title>
                      </line>
                      {showEdgeLabels && !e.from_mention ? (
                        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} className="graph-edge-label">
                          {truncate(e.label, 18)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
              <g className="graph-nodes">
                {graph.nodes.map((n) => {
                  const p = positions.get(n.id);
                  if (!p) return null;
                  const radius = 6 + Math.min(10, Math.sqrt(n.degree) * 2);
                  return (
                    <a
                      key={n.id}
                      href={nodeHref(n.id)}
                      className="graph-node"
                      aria-label={t('nodeLabel', { title: n.title, degree: n.degree })}
                    >
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={radius}
                        fill={colorOf(n.category_ids)}
                        className={n.id === center ? 'graph-center' : undefined}
                      />
                      <text
                        x={p.x}
                        y={p.y + radius + 12}
                        textAnchor="middle"
                        className="graph-label"
                      >
                        {truncate(n.title, 22)}
                      </text>
                    </a>
                  );
                })}
              </g>
            </svg>
          </div>

          {used.length ? (
            <ul className="graph-legend" aria-label={t('legend')}>
              {used.map((c) => (
                <li key={c.id}>
                  <span
                    className="graph-swatch"
                    style={{
                      background:
                        c.color && COLORS.has(c.color) ? `var(--cat-${c.color})` : 'var(--primary)',
                    }}
                    aria-hidden="true"
                  />
                  {c.name}
                </li>
              ))}
            </ul>
          ) : null}

          <h2>{t('tableTitle')}</h2>
          <p className="field-hint">{t('tableHint')}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t('tableScroll')}>
            <table className="data-table">
              <caption className="sr-only">{t('tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('from')}</th>
                  <th scope="col">{t('relation')}</th>
                  <th scope="col">{t('to')}</th>
                </tr>
              </thead>
              <tbody>
                {graph.edges.map((e, i) => (
                  <tr key={i}>
                    <th scope="row">
                      <Link href={`/worlds/${worldId}/snippets/${e.source}`}>
                        {title.get(e.source)}
                      </Link>
                    </th>
                    <td>{e.from_mention ? t('mention') : e.label}</td>
                    <td>
                      <Link href={`/worlds/${worldId}/snippets/${e.target}`}>
                        {title.get(e.target)}
                      </Link>
                    </td>
                  </tr>
                ))}
                {graph.nodes
                  .filter((n) => n.degree === 0)
                  .map((n) => (
                    <tr key={`iso-${n.id}`}>
                      <th scope="row">
                        <Link href={`/worlds/${worldId}/snippets/${n.id}`}>{n.title}</Link>
                      </th>
                      <td colSpan={2}>{t('noRelations')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
