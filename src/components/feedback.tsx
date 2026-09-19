import { getTranslations } from 'next-intl/server';

type Props = { scope: string; notice?: string; error?: string };

/**
 * Avviso ed errore letti dalla query string e mostrati solo se esistono nel catalogo messaggi:
 * un valore arbitrario nell'URL non compare mai in pagina.
 */
export async function Feedback({ scope, notice, error }: Props) {
  const t = await getTranslations(scope);
  const known = (group: 'notices' | 'errors', key?: string) =>
    key && /^[a-z_]+$/.test(key) && t.has(`${group}.${key}`) ? key : undefined;
  const n = known('notices', notice);
  const e = known('errors', error);
  return (
    <>
      {n ? (
        <p role="status" className="message message-info">
          {t(`notices.${n}`)}
        </p>
      ) : null}
      {e ? (
        <p role="alert" className="message message-error">
          {t(`errors.${e}`)}
        </p>
      ) : null}
    </>
  );
}
