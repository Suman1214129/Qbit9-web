import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjjboxrezqiunlejemfr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const sb = createClient(supabaseUrl, serviceRoleKey);
    const tokenId = req.nextUrl.searchParams.get("tokenId");

    let query = sb
      .from("token_view")
      .select("*")
      .in("stage", ["waiting", "checkin", "called", "serving"])
      .order("joined_at", { ascending: false })
      .limit(1);

    if (tokenId) {
      query = sb.from("token_view").select("*").eq("id", tokenId).limit(1);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ active: false, token: null }, { status: 404 });
    }

    return NextResponse.json({ active: true, token: data[0] }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
