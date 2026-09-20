// Identity, owned by better-auth; authorization stays Karet's.
//
// The library handles credentials, cookies, CSRF and — the reason it is here —
// database sessions, so a session row can be deleted and that browser is signed
// out on its next request. The previous stateless cookie could only approximate
// that with a credential fingerprint.
//
// What Karet keeps: the three roles, the policy table that says which role a
// request needs, and the guard that enforces it. Those are authorization
// decisions about pipelines, not identity, and no auth library knows them.
//
// Node runtime only. Middleware checks for a session cookie and nothing more.

import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { Pool } from "pg";
import { databaseUrl } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Better-auth manages its own pool: it opens connections lazily and expects to
 * own their lifecycle, so sharing the app pool would couple two things that
 * shut down at different times.
 */
let pool: Pool | null = null;

function authPool(): Pool {
  pool ??= new Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX) || 4,
  });
  return pool;
}

/**
 * Usernames, not emails. Karet has no mail sender, so verification links and
 * password resets do not exist; accounts are provisioned by an operator. The
 * username plugin needs an email column anyway, so accounts get a synthetic
 * local address that nothing sends to.
 */
export const USERNAME_EMAIL_DOMAIN = "karet.local";

export function syntheticEmail(user: string): string {
  return `${user.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

/**
 * Built by a function so its type is inferred rather than declared: better-auth's
 * `Auth` is generic over the exact options, and widening it to `BetterAuthOptions`
 * loses the additional fields — `username` and `role` would vanish from the
 * session type.
 */
function build() {
  return betterAuth({
  database: authPool(),
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.KARET_SESSION_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Existing hashes are `scrypt$N$r$p$salt$hash` from before this migration.
    // Plugging Karet's own functions in means imported accounts keep working
    // instead of every user needing a reset.
    password: { hash: hashPassword, verify: ({ password, hash }) => verifyPassword(password, hash) },
  },
  plugins: [username()],
  user: {
    additionalFields: {
      // Karet's authorization input. Not better-auth's admin plugin: its notion
      // of roles is about managing users, while these decide who may edit a
      // pipeline or trigger a run.
      role: {
        type: "string",
        required: false,
        defaultValue: "viewer",
        input: false, // never settable through a sign-up or update call
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      // A short cache keeps the common path off the database while leaving
      // revocation quick enough to be useful.
      enabled: true,
      maxAge: 30,
    },
  },
  advanced: {
    // Karet runs behind TLS in production and plain HTTP locally; better-auth
    // picks the right cookie flags from the base URL.
    useSecureCookies: (process.env.BETTER_AUTH_URL ?? "").startsWith("https:"),
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  });
}

let instance: ReturnType<typeof build> | null = null;

/**
 * The auth instance, built on first use.
 *
 * Not a module-level constant: `next build` imports every route to collect page
 * data, and constructing this reads DATABASE_URL, so a top-level instance would
 * make the build require a database URL it has no business knowing. Deferring to
 * the first request also keeps pure helpers downstream unit-testable.
 */
export function getAuth(): ReturnType<typeof build> {
  instance ??= build();
  return instance;
}
