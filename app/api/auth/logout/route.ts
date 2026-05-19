import { NextResponse } from "next/server";
import { clearSessionCookieHeader } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookieHeader({ secure }));
  return res;
}
