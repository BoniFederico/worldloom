'use client';

import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Table as TableIcon,
  Undo2,
  Unlink,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { autosaveBody } from '@/app/worlds/[worldId]/snippets/actions';
import { MAX_JSON_LENGTH, isSafeHref, type DocNode } from '@/lib/snippets/body';

const AUTOSAVE_DELAY_MS = 1500;

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'tooLarge';

/** Ciò che il form può chiedere all'editor: attendere un salvataggio automatico in corso e leggere il token aggiornato. */
export type EditorSync = { busy: () => boolean; wait: () => Promise<void>; token: () => string };

type Props = {
  worldId: string;
  snippetId: string;
  initialDoc: DocNode;
  /** Token di concorrenza (`updated_at`) corrente e callback per aggiornarlo dopo un salvataggio automatico. */
  token: string;
  onToken: (token: string) => void;
  ref?: Ref<EditorSync>;
};

type ChainFn = (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>;

/**
 * Editor rich text (Tiptap/ProseMirror) con salvataggio automatico del corpo. Il documento viaggia nel form
 * come JSON in un campo nascosto e il server lo valida e sanifica di nuovo: l'editor non è un confine di sicurezza.
 * Il documento non viene mai «ripulito» sul client: se supera i limiti non si salva e lo si dice, perché un
 * ripiego vuoto cancellerebbe il corpo esistente.
 */
export function RichEditor({ worldId, snippetId, initialDoc, token, onToken, ref }: Props) {
  const t = useTranslations('Snippets.editor');
  const [json, setJson] = useState(() => JSON.stringify(initialDoc));
  const [rev, setRev] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const tokenRef = useRef(token);
  const docRef = useRef<unknown>(initialDoc);
  const version = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useImperativeHandle(ref, () => ({
    busy: () => inFlight.current !== null,
    wait: async () => {
      await inFlight.current;
    },
    token: () => tokenRef.current,
  }));

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        strike: false,
        underline: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ['http', 'https', 'mailto'],
          isAllowedUri: (url) => isSafeHref(url),
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        id: 'body-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': 'body-label',
        class: 'editor-content prose',
      },
    },
    onUpdate: ({ editor: e }) => {
      version.current += 1;
      docRef.current = e.getJSON();
      const serialized = JSON.stringify(docRef.current);
      setJson(serialized);
      setRev(version.current);
      // Dopo un conflitto l'autosave resta sospeso finché l'utente non ricarica: riprovare col token vecchio non serve.
      setStatus((s) =>
        s === 'conflict' ? s : serialized.length > MAX_JSON_LENGTH ? 'tooLarge' : 'dirty',
      );
    },
  });

  // Salvataggio automatico: dopo una pausa di scrittura si salva solo il corpo, una richiesta alla volta.
  useEffect(() => {
    if (status !== 'dirty') return;
    const timer = setTimeout(() => {
      if (inFlight.current) return; // al termine di quella in corso si riprogramma
      const saving = version.current;
      setStatus('saving');
      const request = (async () => {
        try {
          const result = await autosaveBody({
            world: worldId,
            id: snippetId,
            updated: tokenRef.current,
            doc: docRef.current,
          });
          if (result.ok) {
            tokenRef.current = result.updated;
            onToken(result.updated);
            // Se nel frattempo si è scritto ancora, il nuovo testo è ancora da salvare.
            const more = version.current !== saving;
            setStatus(more ? 'dirty' : 'saved');
            if (more) setRev((r) => r + 1);
          } else setStatus(result.error === 'conflict' ? 'conflict' : 'error');
        } catch {
          setStatus('error');
        }
      })();
      inFlight.current = request;
      void request.finally(() => {
        inFlight.current = null;
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, rev, worldId, snippetId, onToken]);

  // Con modifiche non ancora salvate, lasciare la pagina chiede conferma.
  useEffect(() => {
    if (status !== 'dirty' && status !== 'saving' && status !== 'tooLarge') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  useEffect(() => {
    if (linkOpen) linkInput.current?.focus();
  }, [linkOpen]);

  if (!editor) return <div className="editor-content prose" aria-busy="true" />;

  const closeLink = () => {
    setLinkOpen(false);
    setLinkError(false);
    linkButton.current?.focus();
  };

  const applyLink = (value: string) => {
    const href = value.trim();
    if (!isSafeHref(href)) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    closeLink();
  };

  const icon = (Icon: typeof Bold) => <Icon size={18} aria-hidden="true" />;
  const quiet = status === 'dirty' || status === 'saving';
  const assertive = status === 'error' || status === 'conflict' || status === 'tooLarge';
  const tableTools: [string, ChainFn][] = [
    ['addRow', (c) => c.addRowAfter()],
    ['addColumn', (c) => c.addColumnAfter()],
    ['deleteRow', (c) => c.deleteRow()],
    ['deleteColumn', (c) => c.deleteColumn()],
    ['toggleHeader', (c) => c.toggleHeaderRow()],
  ];

  return (
    <div className="editor">
      <div role="group" aria-label={t('toolbar')} className="toolbar">
        <Tool
          editor={editor}
          label={t('bold')}
          active={editor.isActive('bold')}
          run={(c) => c.toggleBold()}
        >
          {icon(Bold)}
        </Tool>
        <Tool
          editor={editor}
          label={t('italic')}
          active={editor.isActive('italic')}
          run={(c) => c.toggleItalic()}
        >
          {icon(Italic)}
        </Tool>
        <Tool
          editor={editor}
          label={t('code')}
          active={editor.isActive('code')}
          run={(c) => c.toggleCode()}
        >
          {icon(Code)}
        </Tool>
        <Tool
          editor={editor}
          label={t('heading2')}
          active={editor.isActive('heading', { level: 2 })}
          run={(c) => c.toggleHeading({ level: 2 })}
        >
          {icon(Heading2)}
        </Tool>
        <Tool
          editor={editor}
          label={t('heading3')}
          active={editor.isActive('heading', { level: 3 })}
          run={(c) => c.toggleHeading({ level: 3 })}
        >
          {icon(Heading3)}
        </Tool>
        <Tool
          editor={editor}
          label={t('bulletList')}
          active={editor.isActive('bulletList')}
          run={(c) => c.toggleBulletList()}
        >
          {icon(List)}
        </Tool>
        <Tool
          editor={editor}
          label={t('orderedList')}
          active={editor.isActive('orderedList')}
          run={(c) => c.toggleOrderedList()}
        >
          {icon(ListOrdered)}
        </Tool>
        <Tool
          editor={editor}
          label={t('quote')}
          active={editor.isActive('blockquote')}
          run={(c) => c.toggleBlockquote()}
        >
          {icon(Quote)}
        </Tool>
        <button
          ref={linkButton}
          type="button"
          className="btn btn-icon"
          aria-expanded={linkOpen}
          aria-controls="link-panel"
          onClick={() => setLinkOpen((open) => !open)}
        >
          {icon(LinkIcon)}
          <span className="sr-only">{t('link')}</span>
        </button>
        {editor.isActive('link') ? (
          <Tool editor={editor} label={t('unlink')} run={(c) => c.unsetLink()}>
            {icon(Unlink)}
          </Tool>
        ) : null}
        <Tool
          editor={editor}
          label={t('table')}
          run={(c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })}
        >
          {icon(TableIcon)}
        </Tool>
        <Tool
          editor={editor}
          label={t('undo')}
          run={(c) => c.undo()}
          disabled={!editor.can().undo()}
        >
          {icon(Undo2)}
        </Tool>
        <Tool
          editor={editor}
          label={t('redo')}
          run={(c) => c.redo()}
          disabled={!editor.can().redo()}
        >
          {icon(Redo2)}
        </Tool>
      </div>

      {linkOpen ? (
        <div
          id="link-panel"
          className="link-form"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeLink();
            }
          }}
        >
          <label htmlFor="link-href" className="sr-only">
            {t('linkUrl')}
          </label>
          <input
            id="link-href"
            ref={linkInput}
            placeholder="https://"
            aria-invalid={linkError}
            aria-describedby={linkError ? 'link-error' : undefined}
            defaultValue={String(editor.getAttributes('link').href ?? '')}
            onKeyDown={(e) => {
              // Enter applica il link senza inviare il form dello snippet.
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink(e.currentTarget.value);
              }
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => applyLink(linkInput.current?.value ?? '')}
          >
            {t('linkApply')}
          </button>
          {linkError ? (
            <p id="link-error" className="field-hint">
              {t('linkInvalid')}
            </p>
          ) : null}
        </div>
      ) : null}

      {editor.isActive('table') ? (
        <div className="toolbar" role="group" aria-label={t('tableTools')}>
          {tableTools.map(([key, run]) => (
            <button
              key={key}
              type="button"
              className="btn"
              onClick={() => run(editor.chain().focus()).run()}
            >
              {t(key)}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            {t('deleteTable')}
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} />
      <input type="hidden" name="body_json" value={json} />
      <p
        aria-live={assertive ? 'assertive' : 'polite'}
        className="save-status"
        data-status={status}
      >
        {/* «Modifiche non salvate» e «Salvataggio…» compaiono a ogni pausa: non vanno annunciati ogni volta. */}
        <span aria-hidden={quiet}>{status === 'idle' ? '' : t(`status.${status}`)}</span>
      </p>
    </div>
  );
}

type ToolProps = {
  editor: Editor;
  label: string;
  active?: boolean;
  disabled?: boolean;
  run: ChainFn;
  children: ReactNode;
};

function Tool({ editor, label, active, disabled, run, children }: ToolProps) {
  return (
    <button
      type="button"
      className="btn btn-icon"
      aria-pressed={active}
      // `aria-disabled` (non `disabled`) mantiene il pulsante nell'ordine di focus anche dopo un click.
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) run(editor.chain().focus()).run();
      }}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
