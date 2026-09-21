import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Board } from '@/lib/kanban/build';
import { moveCard } from '@/app/worlds/[worldId]/kanban/actions';
import { KanbanDnd } from './kanban-dnd';

/**
 * Bacheca a colonne. Ogni colonna è una sezione con titolo e lista di card, quindi la struttura è già il testo. Si sposta
 * una card con il modulo «Sposta in» (funziona da tastiera e senza JavaScript); il trascinamento è solo un'aggiunta.
 */
export async function KanbanBoard({
  worldId,
  board,
  by,
  category,
  label,
  canWrite,
}: {
  worldId: string;
  board: Board;
  by: string;
  category: string | null;
  label: (value: string | null) => string;
  canWrite: boolean;
}) {
  const t = await getTranslations('Kanban');
  // In «stato» non si può togliere il valore; per un campo sì. Un valore orfano non è una destinazione valida.
  const targets = board.columns.filter((c) => !c.other && (c.value !== null || by !== 'status'));
  return (
    <KanbanDnd enabled={canWrite}>
      <p className="field-hint">{t('count', { count: board.count })}</p>
      <div className="kanban">
        {board.columns.map((column, index) => {
          const name = label(column.value);
          const headingId = `kanban-col-${index}`;
          return (
            <section
              key={column.value ?? '__none'}
              className="kanban-column"
              aria-labelledby={headingId}
              data-column={column.other ? undefined : (column.value ?? '')}
            >
              <h2 id={headingId} className="kanban-title">
                {name} <span className="kanban-count">({column.cards.length})</span>
              </h2>
              {column.other ? <p className="field-hint">{t('otherHint')}</p> : null}
              {column.cards.length ? (
                <ul className="kanban-cards">
                  {column.cards.map((card) => (
                    <li
                      key={card.id}
                      className="kanban-card"
                      draggable={canWrite && card.updated ? true : undefined}
                      data-card={canWrite && card.updated ? card.id : undefined}
                    >
                      <Link href={`/worlds/${worldId}/snippets/${card.id}`}>{card.title}</Link>
                      {canWrite && card.updated ? (
                        <form action={moveCard} className="kanban-move" data-move={card.id}>
                          <input type="hidden" name="world" value={worldId} />
                          <input type="hidden" name="id" value={card.id} />
                          <input type="hidden" name="by" value={by} />
                          {category ? (
                            <input type="hidden" name="category" value={category} />
                          ) : null}
                          <input type="hidden" name="updated" value={card.updated} />
                          <label htmlFor={`to-${card.id}`} className="sr-only">
                            {t('moveLabel', { title: card.title })}
                          </label>
                          <select id={`to-${card.id}`} name="to" defaultValue={column.value ?? ''}>
                            {column.other ? (
                              <option value={column.value ?? ''} disabled>
                                {name}
                              </option>
                            ) : null}
                            {targets.map((c) => (
                              <option key={c.value ?? ''} value={c.value ?? ''}>
                                {label(c.value)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn">
                            {t('move')}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty kanban-empty">{t('emptyColumn')}</p>
              )}
            </section>
          );
        })}
      </div>
    </KanbanDnd>
  );
}
