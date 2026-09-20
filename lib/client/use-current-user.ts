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

/**
 * The same question asked of one pipeline, where a membership may have widened
 * or narrowed the instance role. Null until the fetch lands, so callers render
 * the read-only view rather than flashing controls.
 */
export function usePipelineRole(pipeline: string): Role | null {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRole(null);
    (async () => {
      try {
        const body = await cachedJson<{ role: Role | null }>(`/api/p/${pipeline}/role`);
        if (!cancelled && body.role) setRole(body.role);
      } catch {
        // Leave it null: controls stay hidden until we know otherwise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  return role;
}

/** True once we know the user holds at least `required` on this pipeline. */
export function useCanHere(pipeline: string, required: Role): boolean {
  const role = usePipelineRole(pipeline);
  return role ? roleAtLeast(role, required) : false;
}
