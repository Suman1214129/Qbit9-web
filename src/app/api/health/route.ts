import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjjboxrezqiunlejemfr.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  const start = Date.now();
  const uptime = process.uptime();

  try {
    const sb = createClient(supabaseUrl, anonKey);
    const { count, error } = await sb
      .from("banks")
      .select("*", { count: "exact", head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      return NextResponse.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          uptime,
          database: {
            status: "disconnected",
            error: error.message,
            latencyMs,
          },
          adapter: process.env.NEXT_PUBLIC_QBIT9_ADAPTER || "supabase",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime,
        database: {
          status: "connected",
          banksCount: count ?? 0,
          latencyMs,
        },
        adapter: process.env.NEXT_PUBLIC_QBIT9_ADAPTER || "supabase",
        version: "0.1.0",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime,
        database: {
          status: "error",
          error: errorMessage,
          latencyMs: Date.now() - start,
        },
        adapter: process.env.NEXT_PUBLIC_QBIT9_ADAPTER || "supabase",
      },
      { status: 503 }
    );
  }
}
