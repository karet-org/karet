// What a username and a password may be.
//
// Separate from `users.ts` so the browser can import it: the rules are a regex and
// a number, while that module opens a database. One definition, checked in the
// form for immediate feedback and again in the route, which is the one that counts.
//
// Edge-safe and client-safe: no Node built-ins, no database.

/** What better-auth's username plugin accepts. A hyphen is not in it. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,32}$/;

export const MIN_PASSWORD_LENGTH = 8;

export const MAX_DISPLAY_NAME = 64;

/**
 * Letters, numbers, spaces and the punctuation names actually use, in any script:
 * "Anne-Marie", "O’Neill", "J. R.", "李雷". Not a free text field, so it cannot be
 * used to write a sentence, fake a role or smuggle markup into a list of people.
 */
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N} '’.\-]+$/u;

/** Collapses runs of whitespace, so two names cannot look the same but differ. */
export function cleanDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ");
}

/** Why this display name is unusable, or null. Blank is allowed: it clears it. */
export function displayNameProblem(displayName: string): string | null {
  const clean = cleanDisplayName(displayName);
  if (clean.length === 0) return null;
  if (clean.length > MAX_DISPLAY_NAME) {
    return `A display name must be ${MAX_DISPLAY_NAME} characters or fewer.`;
  }
  return DISPLAY_NAME_PATTERN.test(clean)
    ? null
    : "Use letters, numbers, spaces, apostrophes, hyphens or dots.";
}

/**
 * Why this username is unusable, or null. Rejecting a hyphen here turns a
 * confusing sign-in failure into a message at the point of typing.
 */
export function usernameProblem(username: string): string | null {
  return USERNAME_PATTERN.test(username)
    ? null
    : "Use 3 to 32 letters, numbers, underscores or dots.";
}

/** Why this password is unusable, or null. */
export function passwordProblem(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}
