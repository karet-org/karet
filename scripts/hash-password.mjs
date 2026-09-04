#!/usr/bin/env node
// Generate a KARET_ADMIN_PASSWORD_HASH value.
//
//   npm run hash-password
//
// Reads the password from stdin (not argv, so it stays out of shell
// history and process listings) and prints the scrypt hash.
//
// KEEP IN SYNC with lib/auth/password.ts: same format
// (`scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`) and the same cost params.
// The format is self-describing, so verification accepts hashes made
// with older params after a bump — but this script should always emit
// the current ones.

import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline";

const KEY_LEN = 64;
const SALT_LEN = 16;
const N = 131072; // 2^17, OWASP recommendation
const R = 8;
const P = 1;

function question(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(prompt, (answer) => { rl.close(); resolve(answer); }));
}

const password = (await question("Password: ")).trim();
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const salt = randomBytes(SALT_LEN);
const maxmem = 256 * N * R * P;
scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem }, (err, derived) => {
  if (err) throw err;
  const hash = ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
  console.error("\nPlain value (shell exports, systemd, Kubernetes secrets — quote it):\n");
  console.log(hash);
  console.error(
    "\nDocker Compose .env file (compose interpolates `$`, so it must be doubled):\n",
  );
  console.log(`KARET_ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "$$$$")}`);
});
