import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjjboxrezqiunlejemfr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { counter, staffId, entryId, closeCurrentAs } = body;

    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Call staff_call_next RPC
    const { data: calledTokenId, error } = await sb.rpc("staff_call_next", {
      p_staff_id: staffId || "stf_default",
      p_counter: Number(counter || 1),
      p_entry_id: entryId || null,
      p_close_current_as: closeCurrentAs || "served",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!calledTokenId) {
      return NextResponse.json({ called: false, message: "queue_empty" }, { status: 200 });
    }

    const { data: tokenData } = await sb
      .from("token_view")
      .select("*")
      .eq("id", calledTokenId)
      .maybeSingle();

    return NextResponse.json({ called: true, tokenId: calledTokenId, token: tokenData }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
