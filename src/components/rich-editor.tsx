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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { autosaveBody } from '@/app/worlds/[worldId]/snippets/actions';
import { isSafeHref, sanitizeBody, type DocNode } from '@/lib/snippets/body';

const AUTOSAVE_DELAY_MS = 1500;

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

type Props = {
  worldId: string;
  snippetId: string;
  initialDoc: DocNode;
  /** Token di concorrenza (`updated_at`) corrente e callback per aggiornarlo dopo un salvataggio automatico. */
  token: string;
  onToken: (token: string) => void;
};

/**
 * Editor rich text (Tiptap/ProseMirror) con salvataggio automatico del corpo. Il documento viaggia nel form
 * come JSON in un campo nascosto e il server lo sanifica di nuovo: l'editor non è mai un confine di sicurezza.
 */
export function RichEditor({ worldId, snippetId, initialDoc, token, onToken }: Props) {
  const t = useTranslations('Snippets.editor');
  const [doc, setDoc] = useState<DocNode>(initialDoc);
  const [status, setStatus] = useState<Status>('idle');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const tokenRef = useRef(token);
  const changed = useRef(false);
  const version = useRef(0);
  const linkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

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
      changed.current = true;
      version.current += 1;
      setDoc(sanitizeBody(e.getJSON()));
      setStatus('dirty');
    },
  });

  // Salvataggio automatico: dopo una pausa di scrittura si salva solo il corpo.
  useEffect(() => {
    if (!changed.current || status !== 'dirty') return;
    const timer = setTimeout(async () => {
      setStatus('saving');
      const saving = version.current;
      try {
        const result = await autosaveBody({
          world: worldId,
          id: snippetId,
          updated: tokenRef.current,
          doc,
        });
        if (result.ok) {
          tokenRef.current = result.updated;
          onToken(result.updated);
          // Se nel frattempo si è scritto ancora, il nuovo testo è ancora da salvare.
          setStatus(version.current === saving ? 'saved' : 'dirty');
        } else setStatus(result.error === 'conflict' ? 'conflict' : 'error');
      } catch {
        setStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, status, worldId, snippetId, onToken]);

  if (!editor) return <div className="editor-content prose" aria-busy="true" />;

  const applyLink = (value: string) => {
    const href = value.trim();
    if (!isSafeHref(href)) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
    setLinkError(false);
  };

  return (
    <div className="editor">
      <div role="toolbar" aria-label={t('toolbar')} className="toolbar">
        <Tool
          editor={editor}
          label={t('bold')}
          active={editor.isActive('bold')}
          run={(c) => c.toggleBold()}
        >
          <Bold size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('italic')}
          active={editor.isActive('italic')}
          run={(c) => c.toggleItalic()}
        >
          <Italic size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('code')}
          active={editor.isActive('code')}
          run={(c) => c.toggleCode()}
        >
          <Code size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('heading2')}
          active={editor.isActive('heading', { level: 2 })}
          run={(c) => c.toggleHeading({ level: 2 })}
        >
          <Heading2 size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('heading3')}
          active={editor.isActive('heading', { level: 3 })}
          run={(c) => c.toggleHeading({ level: 3 })}
        >
          <Heading3 size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('bulletList')}
          active={editor.isActive('bulletList')}
          run={(c) => c.toggleBulletList()}
        >
          <List size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('orderedList')}
          active={editor.isActive('orderedList')}
          run={(c) => c.toggleOrderedList()}
        >
          <ListOrdered size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('quote')}
          active={editor.isActive('blockquote')}
          run={(c) => c.toggleBlockquote()}
        >
          <Quote size={18} aria-hidden="true" />
        </Tool>
        <button
          type="button"
          className="btn btn-icon"
          aria-pressed={editor.isActive('link')}
          aria-expanded={linkOpen}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <LinkIcon size={18} aria-hidden="true" />
          <span className="sr-only">{t('link')}</span>
        </button>
        {editor.isActive('link') ? (
          <Tool editor={editor} label={t('unlink')} run={(c) => c.unsetLink()}>
            <Unlink size={18} aria-hidden="true" />
          </Tool>
        ) : null}
        <Tool
          editor={editor}
          label={t('table')}
          run={(c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })}
        >
          <TableIcon size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('undo')}
          run={(c) => c.undo()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={18} aria-hidden="true" />
        </Tool>
        <Tool
          editor={editor}
          label={t('redo')}
          run={(c) => c.redo()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={18} aria-hidden="true" />
        </Tool>
      </div>

      {linkOpen ? (
        <div className="link-form">
          <label htmlFor="link-href" className="sr-only">
            {t('linkUrl')}
          </label>
          <input
            id="link-href"
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
            ref={linkInput}
            autoFocus
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
        <div className="toolbar" role="toolbar" aria-label={t('tableTools')}>
          <button
            type="button"
            className="btn"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            {t('addRow')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            {t('addColumn')}
          </button>
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
      <input type="hidden" name="body_json" value={JSON.stringify(doc)} />
      <p aria-live="polite" className="save-status" data-status={status}>
        {status === 'idle' ? '' : t(`status.${status}`)}
      </p>
    </div>
  );
}

type ToolProps = {
  editor: Editor;
  label: string;
  active?: boolean;
  disabled?: boolean;
  run: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>;
  children: ReactNode;
};

function Tool({ editor, label, active, disabled, run, children }: ToolProps) {
  return (
    <button
      type="button"
      className="btn btn-icon"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => run(editor.chain().focus()).run()}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
