"use client";

// The signed-in user, for hiding controls that would 403 anyway.
//
// Presentation only. Every route enforces its own role server-side, so a
// tampered client can misdraw its own buttons and change nothing.

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client/fetch-cache";
import { roleAtLeast, type Role } from "@/lib/auth/roles";

export interface CurrentUser {
  username: string;
  role: Role;
  service: boolean;
}

interface MeResponse {
  authenticated: boolean;
  user?: CurrentUser;
}

/**
 * Null until the fetch lands, so callers should treat null as "don't know yet"
 * and render the read-only view rather than flashing controls a viewer cannot
 * use.
 */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await cachedJson<MeResponse>("/api/auth/me");
        if (!cancelled && body.user) setUser(body.user);
      } catch {
        // Leave it null: controls stay hidden until we know otherwise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}

/** True once we know the user holds at least `required`. */
export function useCan(required: Role): boolean {
  const user = useCurrentUser();
  return user ? roleAtLeast(user.role, required) : false;
}
