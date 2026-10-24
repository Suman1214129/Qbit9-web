import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjjboxrezqiunlejemfr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { branchId, serviceId, priority, proof } = body;

    if (!branchId || !serviceId) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { data: tokenId, error } = await sb.rpc("join_queue", {
      p_branch_id: branchId,
      p_service_id: serviceId,
      p_priority: Array.isArray(priority) ? priority : [],
      p_proof_lat: proof?.lat ?? 28.6315,
      p_proof_lng: proof?.lng ?? 77.2167,
      p_proof_accuracy: proof?.accuracy ?? 20,
      p_proof_captured_at: proof?.capturedAt ?? Date.now(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: viewData } = await sb
      .from("token_view")
      .select("*")
      .eq("id", tokenId)
      .maybeSingle();

    return NextResponse.json({ ok: true, tokenId, token: viewData }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
