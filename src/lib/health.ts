export type Health = { status: 'ok'; time: string };

export function getHealth(now: Date = new Date()): Health {
  return { status: 'ok', time: now.toISOString() };
}
