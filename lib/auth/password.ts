// Password hashing -- scrypt via the Node `crypto` module.
//
// Stored hash format: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`. Embedding the
// parameters lets us tune cost factors later without breaking existing hashes.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;
const SALT_LEN = 16;
// OWASP scrypt recommendation as of 2024: N=2^17, r=8, p=1.
// Existing stored hashes carry their own cost params, so old logins
// continue to verify when this is bumped.
const N = 131072;
const R = 8;
const P = 1;

/**
 * Wraps Node's callback-style `crypto.scrypt` and forwards `cost`/`blockSize`/
 * `parallelization`. We can't use `promisify` because we need to pass
 * `maxmem` -- the default 32 MiB is below what N=2^17 requires.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  // scrypt memory bound is 128 * cost * blockSize * parallelization. Pad ×2
  // so future minor bumps don't immediately re-trip the ceiling.
  const maxmem = 256 * cost * blockSize * parallelization;
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      keylen,
      { N: cost, r: blockSize, p: parallelization, maxmem },
      (err, derived) => (err ? reject(err) : resolve(derived as Buffer)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(password, salt, KEY_LEN, N, R, P);
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, cost, blockSize, parallelization);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
