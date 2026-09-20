// Administering accounts: who may do what to whom.
//
// The rules used to exist only as `NextResponse` constructions inside the route
// handlers, which meant `users.ts` would happily demote the bootstrap admin or
// delete the caller, and nothing could check the rules without an HTTP request.
// They live here now, behind one interface, and the routes map an Outcome to a
// status.
//
// Node runtime only.

import { refuse, type Outcome } from "@/lib/outcome";
import { hashPassword } from "@/lib/auth/password";
import { isRole, type Role } from "@/lib/auth/roles";
import type { Principal } from "@/lib/auth/service-token";
import { passwordProblem, usernameProblem } from "@/lib/auth/account-rules";
import {
  createUser,
  deleteUser,
  findUserByUsername,
  getAdminUsername,
  listUsers,
  pipelinesOwnedBy,
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
  { username: string; role: Role; createdAt: string; bootstrap: boolean }[]
> {
  return (await listUsers()).map((u) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    bootstrap: isBootstrap(u.username),
  }));
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
