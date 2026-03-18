import { AuthService } from "./auth.js";

export function bootstrapAuth(userId: string): string {
  const auth = new AuthService();
  return auth.issueSession(userId).token;
}
