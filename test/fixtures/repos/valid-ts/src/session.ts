export const SESSION_TTL_MS = 1000 * 60 * 30;

export function createSession(userId: string): string {
  return `session:${userId}`;
}
