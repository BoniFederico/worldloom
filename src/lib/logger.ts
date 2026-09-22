type LogValue = string | number | boolean | null | undefined;
type LogContext = Record<string, LogValue>;

const REDACTED = '[redatto]';

// Chiavi che nei dati di questo progetto tendono a contenere dati personali (email, nomi, testo libero).
// Redatte per costruzione: nessun log strutturato deve poter portare PII anche per errore di chi chiama.
const PII_KEYS = new Set([
  'email',
  'password',
  'displayName',
  'display_name',
  'name',
  'body',
  'content',
  'message',
  'notes',
  'ip',
]);

function sanitize(context: LogContext): LogContext {
  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = PII_KEYS.has(key) ? REDACTED : value;
  }
  return safe;
}

function write(level: 'error' | 'warn', event: string, context: LogContext) {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...sanitize(context),
  });
  console[level](line);
}

/** Log strutturato per errori server, raccolto da Vercel senza dati personali (#45). */
export function logError(event: string, context: LogContext = {}) {
  write('error', event, context);
}

export function logWarn(event: string, context: LogContext = {}) {
  write('warn', event, context);
}
