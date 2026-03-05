/**
 * auth.ts — iron-session v8 configuration and helpers
 */

import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: number;
  email: string;
  role: "owner" | "collaborator" | "viewer";
  isLoggedIn: boolean;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "fallback-dev-secret-must-be-32-chars!!";

export const sessionOptions = {
  password: SESSION_SECRET,
  cookieName: "runway_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 60 * 8, // 8 hours
    sameSite: "lax" as const,
  },
};

/**
 * Get the current session in a Server Component or Route Handler.
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Returns the session data if logged in, or null if not.
 */
export async function requireAuth(): Promise<SessionData> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    throw new Error("Unauthorized");
  }
  return session as SessionData;
}

/**
 * Returns session data or null (no throw).
 */
export async function optionalAuth(): Promise<SessionData | null> {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return null;
    return session as SessionData;
  } catch {
    return null;
  }
}
