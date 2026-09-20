// Administering accounts: who may do what to whom.
//
// The rules live here rather than in the handlers: `users.ts` will happily demote
// the bootstrap admin or delete the caller, so something above it has to refuse,
// and a refusal is worth testing without an HTTP request. Routes map the Outcome
// to a status.
//
// Node runtime only.

import { refuse, type Outcome } from "@/lib/outcome";
import { hashPassword } from "@/lib/auth/password";
import { isRole, type Role } from "@/lib/auth/roles";
import type { Principal } from "@/lib/auth/service-token";
import {
  cleanDisplayName,
  displayNameProblem,
  passwordProblem,
  usernameProblem,
} from "@/lib/auth/account-rules";
import { verifyPassword } from "@/lib/auth/password";
import {
  createUser,
  credentialHash,
  deleteUser,
  findUserByUsername,
  getAdminUsername,
  listUsers,
  pipelinesOwnedBy,
  setDisplayName,
  setPassword,
  setRole,
  type User,
} from "@/lib/auth/users";

/** The environment sets this account's role and password on every start. */
export function isBootstrap(username: string): boolean {
  return username.toLowerCase() === getAdminUsername().toLowerCase();
}

function isSelf(actor: Principal, username: string): boolean {
  return !actor.service && username.toLowerCase() === actor.username.toLowerCase();
}

/** Accounts, each marked if the environment owns it. */
export async function accounts(): Promise<
  { username: string; displayName: string; role: Role; createdAt: string; bootstrap: boolean }[]
> {
  return (await listUsers()).map((u) => ({
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    bootstrap: isBootstrap(u.username),
  }));
}

/**
 * What this person is called, set by them. Blank clears it, and a cleared name
 * reads back as the username, so there is always something to show.
 */
export async function changeOwnDisplayName(
  actor: Principal,
  displayName: unknown,
): Promise<Outcome<{ displayName: string }>> {
  if (typeof displayName !== "string") {
    return refuse("invalid_display_name", "A display name must be text.");
  }
  const bad = displayNameProblem(displayName);
  if (bad) return refuse("invalid_display_name", bad);
  const trimmed = cleanDisplayName(displayName);

  if (!actor.userId) return refuse("service_principal", "The service token has no name.", 403);

  await setDisplayName(actor.userId, trimmed);
  return { ok: true, value: { displayName: trimmed || actor.username } };
}

/**
 * Change your own password, proving you know the current one.
 *
 * The proof is the point: a session someone else has picked up can already act as
 * you, and without it that session could also lock you out of your own account.
 * It signs every session out, this one included.
 */
export async function changeOwnPassword(
  actor: Principal,
  currentPassword: unknown,
  newPassword: unknown,
): Promise<Outcome<{ username: string }>> {
  if (actor.service) {
    return refuse("service_principal", "The service token has no password to change.", 403);
  }
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return refuse("weak_password", "Send the current password and a new one.");
  }
  const bad = passwordProblem(newPassword);
  if (bad) return refuse("weak_password", bad);

  if (!actor.userId) return refuse("service_principal", "The service token has no password.", 403);
  // The environment re-asserts this account's password on every start, so a
  // change here would last until the next restart.
  if (isBootstrap(actor.username)) return bootstrapRefusal();

  const stored = await credentialHash(actor.userId);
  if (!stored || !(await verifyPassword(currentPassword, stored))) {
    return refuse("wrong_password", "That is not your current password.", 403);
  }

  await setPassword(actor.userId, await hashPassword(newPassword));
  return { ok: true, value: { username: actor.username } };
}

export async function createAccount(
  input: { username?: string; password?: string; role?: string },
): Promise<Outcome<User>> {
  const username = input.username?.trim() ?? "";
  const password = input.password ?? "";

  const badUsername = usernameProblem(username);
  if (badUsername) return refuse("invalid_username", badUsername);
  const badPassword = passwordProblem(password);
  if (badPassword) return refuse("weak_password", badPassword);
  if (!isRole(input.role)) {
    return refuse("invalid_role", "Role must be viewer, editor or admin.");
  }
  if (await findUserByUsername(username)) {
    return refuse("already_exists", `${username} already has an account.`, 409);
  }

  return { ok: true, value: await createUser(username, input.role, await hashPassword(password)) };
}

/**
 * Change a role. Refused for the bootstrap admin, whose role the environment
 * restores anyway, and for the caller's own account, since demoting yourself
 * takes away the page you are standing on.
 */
export async function changeRole(
  actor: Principal,
  username: string,
  role: unknown,
): Promise<Outcome<{ username: string; role: Role }>> {
  if (!isRole(role)) return refuse("invalid_role", "Role must be viewer, editor or admin.");

  const user = await findUserByUsername(username);
  if (!user) return refuse("no_such_user", `No account named ${username}.`, 404);
  if (isBootstrap(user.username)) return bootstrapRefusal();
  if (isSelf(actor, user.username)) {
    return refuse("self_role_change", "You cannot change your own role. Ask another admin.");
  }

  const updated = await setRole(user.username, role);
  return { ok: true, value: { username: user.username, role: updated?.role ?? role } };
}

/**
 * Set a password and end that account's sessions. The caller's own account is
 * allowed: it signs them out, which is what a reset means.
 */
export async function resetPassword(
  username: string,
  password: unknown,
): Promise<Outcome<{ username: string }>> {
  if (typeof password !== "string") {
    return refuse("weak_password", passwordProblem("") ?? "Password is required.");
  }
  const bad = passwordProblem(password);
  if (bad) return refuse("weak_password", bad);

  const user = await findUserByUsername(username);
  if (!user) return refuse("no_such_user", `No account named ${username}.`, 404);
  if (isBootstrap(user.username)) return bootstrapRefusal();

  await setPassword(user.id, await hashPassword(password));
  return { ok: true, value: { username: user.username } };
}

/** Delete an account. Refused for the bootstrap admin and for the caller's own. */
export async function removeAccount(
  actor: Principal,
  username: string,
): Promise<Outcome<{ username: string }>> {
  const user = await findUserByUsername(username);
  if (!user) return refuse("no_such_user", `No account named ${username}.`, 404);
  if (isBootstrap(user.username)) return bootstrapRefusal();
  if (isSelf(actor, user.username)) {
    return refuse("self_delete", "You cannot delete the account you are signed in as.");
  }

  await deleteUser(user.id);
  return { ok: true, value: { username: user.username } };
}

/** What deleting this account would cost, so a confirmation can say. */
export async function deletionCost(
  username: string,
): Promise<Outcome<{ ownedPipelines: string[] }>> {
  const user = await findUserByUsername(username);
  if (!user) return refuse("no_such_user", `No account named ${username}.`, 404);
  return { ok: true, value: { ownedPipelines: await pipelinesOwnedBy(user.id) } };
}

function bootstrapRefusal(): Outcome<never> {
  return refuse(
    "bootstrap_admin",
    "This account comes from the environment and is restored on restart. " +
      "Change KARET_ADMIN_USERNAME to retire it.",
  );
}
