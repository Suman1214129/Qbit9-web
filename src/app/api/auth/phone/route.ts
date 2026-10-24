import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizePhone, validatePhone } from "@/domain/validation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjjboxrezqiunlejemfr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getAdminClient() {
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// In-memory challenge store for mobile verification
interface PhoneChallenge {
  phone: string;
  code: string;
  tokenHash: string;
  expiresAt: number;
  attempts: number;
}

const challenges = new Map<string, PhoneChallenge>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phone: rawPhone, code, name } = body;

    const phoneCheck = validatePhone(rawPhone || "");
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: "invalid_phone", message: phoneCheck.error }, { status: 400 });
    }
    const phone = normalizePhone(rawPhone);
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }

    if (action === "request") {
      const now = Date.now();
      const existing = challenges.get(phone);
      if (existing && existing.expiresAt > now && now - (existing.expiresAt - 10 * 60_000) < 30_000) {
        return NextResponse.json({ error: "resend_too_soon" }, { status: 429 });
      }

      // Check if user exists or create internal auth identity for phone
      const digits = phone.replace(/\D/g, "");
      const internalEmail = `${digits}@phone.qbit9.internal`;

      const { data: usersData } = await admin.auth.admin.listUsers();
      let user = usersData?.users?.find((u) => u.phone === phone || u.email === internalEmail);

      if (!user) {
        const createRes = await admin.auth.admin.createUser({
          email: internalEmail,
          email_confirm: true,
          phone: phone,
          user_metadata: { phone, name: name || null },
        });
        user = createRes.data?.user ?? undefined;
      }

      // Generate magic link / token hash
      const linkRes = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: internalEmail,
      });

      const tokenHash = linkRes.data?.properties?.hashed_token || "";
      const otpCode = "1234"; // Default dev OTP code

      challenges.set(phone, {
        phone,
        code: otpCode,
        tokenHash,
        expiresAt: now + 10 * 60_000,
        attempts: 0,
      });

      // Check if profile exists
      const { data: profile } = await admin.from("profiles").select("name").eq("phone", phone).maybeSingle();

      return NextResponse.json({
        ok: true,
        phone,
        needsName: !profile?.name,
        expiresAt: now + 10 * 60_000,
        resendAvailableAt: now + 30_000,
        debugCode: otpCode,
      });
    }

    if (action === "verify") {
      const challenge = challenges.get(phone);
      const now = Date.now();

      if (!challenge || challenge.expiresAt < now) {
        challenges.delete(phone);
        return NextResponse.json({ error: "code_expired" }, { status: 400 });
      }

      if (challenge.attempts >= 5) {
        return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
      }

      if (challenge.code !== (code || "").trim()) {
        challenge.attempts += 1;
        return NextResponse.json({ error: "invalid_code" }, { status: 400 });
      }

      challenges.delete(phone);
      return NextResponse.json({
        ok: true,
        tokenHash: challenge.tokenHash,
      });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (err) {
    console.error("Auth phone route error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
