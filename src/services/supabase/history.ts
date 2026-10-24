import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_POLICY,
  buildHistory,
  estimateWait,
  historyStats,
  waitMid,
  type Booking,
  type HistoryItem,
  type TokenRecord,
} from "@/domain";
import { clock } from "@/lib/clock";
import type { HistoryPage, HistoryService } from "../types";
import { getSupabaseClient } from "./client";
import { toDomainError } from "./queue";

export function createHistoryService(client?: SupabaseClient): HistoryService {
  const sb = client ?? getSupabaseClient();

  return {
    async list(): Promise<HistoryPage> {
      try {
        const now = clock.now();
        const { data: userRes } = await sb.auth.getUser();
        if (!userRes?.user) {
          const emptyItems: HistoryItem[] = [];
          return { items: emptyItems, stats: historyStats(emptyItems) };
        }

        const [tokensRes, bookingsRes, branchesRes, servicesRes] = await Promise.all([
          sb.from("tokens").select("*").eq("user_id", userRes.user.id).order("joined_at", { ascending: false }),
          sb.from("bookings").select("*").eq("user_id", userRes.user.id).order("starts_at", { ascending: false }),
          sb.from("branches").select("id, name"),
          sb.from("services").select("id, name, group_id, avg_service_min"),
        ]);

        if (tokensRes.error) throw toDomainError(tokensRes.error);
        if (bookingsRes.error) throw toDomainError(bookingsRes.error);

        const branchNames = new Map<string, string>();
        for (const b of (branchesRes.data as Array<{ id: string; name: string }>) ?? []) {
          branchNames.set(b.id, b.name);
        }

        const serviceMap = new Map<string, { name: string; groupId: string; avg: number }>();
        for (const s of (servicesRes.data as Array<{ id: string; name: string; group_id: string; avg_service_min: number }>) ?? []) {
          serviceMap.set(s.id, { name: s.name, groupId: s.group_id, avg: s.avg_service_min });
        }

        const tokens: TokenRecord[] = (tokensRes.data ?? []).map((t: Record<string, unknown>) => ({
          id: String(t.id),
          code: String(t.code),
          number: Number(t.number),
          branchId: String(t.branch_id),
          serviceId: String(t.service_id),
          groupId: String(t.group_id),
          userId: String(t.user_id),
          source: t.source as any,
          priority: (t.priority as any) ?? [],
          joinedAt: new Date(String(t.joined_at)).getTime(),
          aheadAtJoin: Number(t.ahead_at_join ?? 0),
          delayPositions: Number(t.delay_positions ?? 0),
          lapseCount: Number(t.lapse_count ?? 0),
          checkinPromptedAt: t.checkin_prompted_at ? new Date(String(t.checkin_prompted_at)).getTime() : null,
          checkinConfirmedAt: t.checkin_confirmed_at ? new Date(String(t.checkin_confirmed_at)).getTime() : null,
          calledAt: t.called_at ? new Date(String(t.called_at)).getTime() : null,
          counter: t.counter != null ? Number(t.counter) : null,
          onMyWayAt: t.on_my_way_at ? new Date(String(t.on_my_way_at)).getTime() : null,
          extraTimeMs: Number(t.extra_time_ms ?? 0),
          extensionCount: Number(t.extension_count ?? 0),
          servingStartedAt: t.serving_started_at ? new Date(String(t.serving_started_at)).getTime() : null,
          servedAt: t.served_at ? new Date(String(t.served_at)).getTime() : null,
          missedAt: t.missed_at ? new Date(String(t.missed_at)).getTime() : null,
          leftAt: t.left_at ? new Date(String(t.left_at)).getTime() : null,
          feedback: (t.feedback as any) ?? null,
          reconciledAt: t.reconciled_at ? new Date(String(t.reconciled_at)).getTime() : now,
          bookingId: t.booking_id ? String(t.booking_id) : null,
        }));

        const bookings: Booking[] = (bookingsRes.data ?? []).map((b: Record<string, unknown>) => ({
          id: String(b.id),
          userId: String(b.user_id),
          branchId: String(b.branch_id),
          serviceId: String(b.service_id),
          startsAt: new Date(String(b.starts_at)).getTime(),
          durationMin: Number(b.duration_min ?? 30),
          status: b.status as any,
          createdAt: new Date(String(b.created_at)).getTime(),
          tokenId: b.token_id ? String(b.token_id) : null,
        }));

        const items = buildHistory(tokens, bookings, {
          timezone: "Asia/Kolkata",
          branchName: (id) => branchNames.get(id) ?? "Branch",
          serviceName: (id) => serviceMap.get(id)?.name ?? "Service",
          savedMin: (t: TokenRecord) => {
            const found = serviceMap.get(t.serviceId);
            if (!found) return null;
            return Math.round(
              waitMid(
                estimateWait(
                  Math.max(0, t.aheadAtJoin - DEFAULT_POLICY.nearThreshold),
                  found.avg,
                  2,
                ),
              ),
            );
          },
        });

        return { items, stats: historyStats(items) };
      } catch (err) {
        throw toDomainError(err);
      }
    },
  };
}

export const createSupabaseHistoryService = createHistoryService;
