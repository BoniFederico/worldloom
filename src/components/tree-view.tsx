import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Forest, TreeNode } from '@/lib/tree/build';

type Translate = Awaited<ReturnType<typeof getTranslations>>;

function Branch({ node, worldId, t }: { node: TreeNode; worldId: string; t: Translate }) {
  const href = `/worlds/${worldId}/snippets/${node.id}`;
  return (
    <li>
      <Link href={href}>{node.title}</Link>
      {node.kind === 'cycle' ? (
        <span className="tree-note"> ({t('cycleNote')})</span>
      ) : node.kind === 'repeat' ? (
        <span className="tree-note"> ({t('repeatNote')})</span>
      ) : null}
      {node.children.length ? (
        <ul>
          {node.children.map((child, i) => (
            <Branch key={`${child.id}-${i}`} node={child} worldId={worldId} t={t} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * L'albero è una lista annidata: la struttura è già il testo (un lettore di schermo la annuncia con i livelli), e le linee
 * di collegamento sono solo decorazione CSS. Ogni nome è un link allo snippet.
 */
export async function TreeView({ worldId, forest }: { worldId: string; forest: Forest }) {
  const t = await getTranslations('Tree');
  return (
    <div>
      <p className="field-hint">{t('count', { nodes: forest.count, edges: forest.edgeCount })}</p>
      {forest.hasCycle ? <p className="message message-info">{t('cycleWarning')}</p> : null}
      {forest.truncated ? <p className="message message-info">{t('truncated')}</p> : null}
      {forest.roots.length ? (
        <ul className="tree" aria-label={t('treeLabel')}>
          {forest.roots.map((root) => (
            <Branch key={root.id} node={root} worldId={worldId} t={t} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
