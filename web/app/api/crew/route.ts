import { NextResponse } from "next/server";
import { listCrew } from "@/lib/crew-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crew = await listCrew(true);
    return NextResponse.json({ ok: true, crew, count: crew.length });
  } catch (error) {
    console.error("[FIREALERT] crew", error);
    return NextResponse.json({ ok: false, error: "Could not load crew roster" }, { status: 503 });
  }
}
