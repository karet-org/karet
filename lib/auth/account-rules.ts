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
