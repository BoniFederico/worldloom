'use client';

import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
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
import { createMentionController, type MentionState } from '@/components/mention-controller';
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
  const [imageOpen, setImageOpen] = useState(false);
  const [imageState, setImageState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [imageMessage, setImageMessage] = useState('');
  const imageFile = useRef<HTMLInputElement>(null);
  const imageAlt = useRef<HTMLInputElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const tokenRef = useRef(token);
  const docRef = useRef<unknown>(initialDoc);
  const version = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  // Il controllo dei suggerimenti tiene il proprio stato mutabile fuori dal render.
  const [mentions] = useState(() => createMentionController({ worldId, snippetId }, setMention));

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
      // Blocco, non inline; `src` ammesso solo se punta a un'immagine caricata nell'app (lo impone anche il server).
      Image.configure({ inline: false, allowBase64: false }),
      // `@` apre i suggerimenti (titoli e alias); la menzione diventa una relazione al salvataggio.
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: { char: '@', items: mentions.items, render: mentions.render },
      }),
    ],
    content: initialDoc,
    editorProps: {
      // Le immagini incollate da altri siti non entrano: si inseriscono solo caricandole.
      transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
      attributes: {
        id: 'body-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': 'body-label',
        'aria-haspopup': 'listbox',
        'aria-controls': 'mention-list',
        class: 'editor-content prose',
      },
    },
    onUpdate: ({ editor: e }) => {
      version.current += 1;
      // Copia «piatta» via JSON: gli `attrs` di ProseMirror non sono oggetti semplici e la serializzazione delle
      // server action li sostituirebbe con un segnaposto (perdendo ad esempio l'id di una menzione).
      const serialized = JSON.stringify(e.getJSON());
      docRef.current = JSON.parse(serialized);
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

  // L'editor indica quale voce dell'elenco è selezionata (aria-expanded non è ammesso su un textbox).
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (mention && mention.items.length > 0) {
      dom.setAttribute('aria-activedescendant', `mention-option-${mention.index}`);
      document
        .getElementById(`mention-option-${mention.index}`)
        ?.scrollIntoView({ block: 'nearest' });
    } else dom.removeAttribute('aria-activedescendant');
  }, [editor, mention]);

  useEffect(() => {
    if (linkOpen) linkInput.current?.focus();
  }, [linkOpen]);

  useEffect(() => {
    if (imageOpen) imageFile.current?.focus();
  }, [imageOpen]);

  if (!editor) return <div className="editor-content prose" aria-busy="true" />;

  const closeLink = () => {
    setLinkOpen(false);
    setLinkError(false);
    linkButton.current?.focus();
  };

  const closeImage = () => {
    setImageOpen(false);
    setImageState('idle');
    imageButton.current?.focus();
  };

  const uploadImage = async () => {
    const file = imageFile.current?.files?.[0];
    if (!file) {
      setImageState('error');
      setImageMessage(t('imageMissing'));
      return;
    }
    setImageState('uploading');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/worlds/${worldId}/images`, { method: 'POST', body });
      const result: { src?: string; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !result.src) {
        setImageState('error');
        setImageMessage(
          result.error === 'unsupported' || result.error === 'too_large'
            ? t(`imageErrors.${result.error}`)
            : t('imageErrors.generic'),
        );
        return;
      }
      editor
        .chain()
        .focus()
        .setImage({ src: result.src, alt: imageAlt.current?.value.trim() ?? '' })
        .run();
      closeImage();
    } catch {
      setImageState('error');
      setImageMessage(t('imageErrors.generic'));
    }
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
        <button
          ref={imageButton}
          type="button"
          className="btn btn-icon"
          aria-expanded={imageOpen}
          aria-controls="image-panel"
          onClick={() => setImageOpen((open) => !open)}
        >
          {icon(ImagePlus)}
          <span className="sr-only">{t('image')}</span>
        </button>
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

      {imageOpen ? (
        <div
          id="image-panel"
          className="link-form"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeImage();
            }
          }}
        >
          <label htmlFor="image-file">{t('imageFile')}</label>
          <input
            id="image-file"
            ref={imageFile}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />
          <label htmlFor="image-alt">{t('imageAlt')}</label>
          <input id="image-alt" ref={imageAlt} maxLength={300} aria-describedby="image-alt-hint" />
          <p id="image-alt-hint" className="field-hint">
            {t('imageAltHint')}
          </p>
          <button
            type="button"
            className="btn"
            disabled={imageState === 'uploading'}
            onClick={() => void uploadImage()}
          >
            {imageState === 'uploading' ? t('imageUploading') : t('imageInsert')}
          </button>
          <span className="sr-only" aria-live="polite">
            {imageState === 'uploading' ? t('imageUploading') : ''}
          </span>
          {imageState === 'error' ? (
            <p role="alert" className="field-hint">
              {imageMessage}
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
      {mention ? (
        <ul
          id="mention-list"
          role="listbox"
          aria-label={t('mentionList')}
          className="mention-list"
          style={{ top: mention.top, left: Math.max(8, mention.left) }}
        >
          {mention.items.length === 0 ? (
            <li role="presentation" className="mention-none">
              {t('mentionNone')}
            </li>
          ) : (
            mention.items.map((item, i) => (
              <li
                key={item.id}
                id={`mention-option-${i}`}
                role="option"
                aria-selected={i === mention.index}
                className="mention-option"
                // mousedown (no click): l'editor non deve perdere il focus prima di inserire la menzione.
                onMouseDown={(e) => {
                  e.preventDefault();
                  mention.command(item);
                }}
              >
                {item.title}
                {item.alias ? (
                  <span className="role"> ({t('mentionAlias', { alias: item.alias })})</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {mention
          ? mention.items.length === 0
            ? t('mentionNone')
            : `${t('mentionCount', { count: mention.items.length })} ${mention.items[mention.index]?.title ?? ''}`
          : ''}
      </span>
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
