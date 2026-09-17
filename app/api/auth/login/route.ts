import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth/users";
import { issueSessionCookie } from "@/lib/auth/session";
import { acquire, clientKey, release, reset } from "@/lib/auth/throttle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const password = body?.password;
  const username = body?.username?.trim();
  if (!password || !username) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  // Throttle before the expensive scrypt verification: per-client token
  // bucket + a global cap on concurrent verifications (each costs
  // ~128 MiB, so unbounded parallelism is a remote OOM lever).
  // Keyed by client, not by username, so guessing many usernames from one
  // address still burns the same bucket.
  const key = clientKey(request);
  const decision = acquire(key);
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: decision.reason === "busy" ? "server_busy" : "rate_limited",
        message:
          decision.reason === "busy"
            ? "Too many concurrent login attempts; try again shortly."
            : "Too many login attempts; wait before retrying.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(decision.retryAfterS) },
      },
    );
  }

  try {
    const user = await verifyCredentials(username, password);
    if (!user) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 },
      );
    }
    reset(key); // fat-fingered attempts shouldn't count after a success
    return await issueSessionCookie(request, user);
  } finally {
    release();
  }
}
