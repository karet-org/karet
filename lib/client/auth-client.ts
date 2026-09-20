"use client";

// Better-auth's browser client. Sign-in and sign-out go through it so the cookie
// handling stays in one place; everything else in the UI reads /api/auth/me.

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
