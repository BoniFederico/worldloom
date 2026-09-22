import { getTranslations } from 'next-intl/server';

type PageProps = {
  title: string;
  lead?: string;
  notice?: string;
  error?: string;
  children: React.ReactNode;
};

const NOTICES = ['check_email', 'reset_sent', 'password_updated', 'account_deleted'];
const ERRORS = [
  'invalid_input',
  'invalid_credentials',
  'email_not_confirmed',
  'link',
  'generic',
  'privacy_required',
  'confirm_required',
  'owns_worlds',
  'owns_campaigns',
];

/** Cornice comune delle pagine di accesso: titolo, avvisi ed errori con ruoli accessibili. */
export async function AuthPage({ title, lead, notice, error, children }: PageProps) {
  const t = await getTranslations('Auth');
  return (
    <main id="main" className="page">
      <section className="auth">
        <h1>{title}</h1>
        {lead ? <p className="auth-lead">{lead}</p> : null}
        {notice && NOTICES.includes(notice) ? (
          <p role="status" className="message message-info">
            {t(`notices.${notice}`)}
          </p>
        ) : null}
        {error && ERRORS.includes(error) ? (
          <p role="alert" className="message message-error">
            {t(`errors.${error}`)}
          </p>
        ) : null}
        {children}
      </section>
    </main>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: string;
};

export function Field({ name, label, type = 'text', autoComplete, hint }: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        required
      />
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
