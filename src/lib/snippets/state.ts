/** Valori digitati nel form dello snippet: si rimandano alla pagina se il salvataggio non riesce. */
export type SnippetDraft = {
  title: string;
  status: string;
  body: string;
  bodyJson: string;
  tags: string;
  aliases: string;
  categories: string[];
  fields: Record<string, string>;
};

/** Esito di un salvataggio non riuscito. In caso di successo l'azione fa `redirect`. */
export type SaveState = {
  error: string;
  keys: string[];
  draft: SnippetDraft;
  nonce: number;
} | null;
