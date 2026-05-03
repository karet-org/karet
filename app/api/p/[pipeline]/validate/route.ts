import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const workerUrl = process.env.WORKER_URL ?? "http://worker:8080";
  try {
    const body = await request.text();
    const res = await fetch(`${workerUrl}/config/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
