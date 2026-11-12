import { currentPrincipal } from "@/lib/auth/current-user";

// Read-only. Changing your own display name or password is `PATCH /api/account`.

export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({
    authenticated: true,
    user: {
      username: principal.username,
      displayName: principal.displayName,
      role: principal.role,
      service: principal.service,
    },
  });
}
