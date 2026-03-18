import { createSession, SESSION_TTL_MS } from "./session.js";

export class AuthService {
  issueSession(userId: string): { token: string; ttlMs: number } {
    return {
      token: createSession(userId),
      ttlMs: SESSION_TTL_MS,
    };
  }
}
