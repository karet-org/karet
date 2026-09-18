-- Better-auth's core schema, plus the one field Karet adds to it.
--
-- Emitted by `npx @better-auth/cli generate` and committed rather than applied
-- by the CLI at deploy time, so there is a single ordered migration path. If
-- better-auth's schema changes, regenerate and add a new migration; do not edit
-- this file.
--
-- `role` is a Karet addition (better-auth `user.additionalFields`). Identity and
-- sessions belong to the library; authorization stays Karet's, decided by
-- lib/auth/policy.ts.

CREATE TABLE "user" (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image          text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  username       text UNIQUE,
  "displayUsername" text,
  role           text NOT NULL DEFAULT 'viewer'
    CONSTRAINT user_role_valid CHECK (role IN ('viewer', 'editor', 'admin'))
);

CREATE TABLE session (
  id          text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

-- Deleting a row here signs that session out on its next request: this is the
-- server-side revocation the previous stateless cookie could only approximate.
CREATE INDEX session_user_idx ON session("userId");
CREATE INDEX session_expires_idx ON session("expiresAt");

CREATE TABLE account (
  id                      text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_user_idx ON account("userId");

CREATE TABLE verification (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_identifier_idx ON verification(identifier);
