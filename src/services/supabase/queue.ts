import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DomainError,
  estimateWait,
  type EpochMs,
  type ID,
  type LocationProof,
  type PriorityTag,
  type TokenFeedback,
  type TokenSource,
  type TokenStage,
  type TokenView,
} from "@/domain";
import { clock } from "@/lib/clock";
import type { CheckInBookingInput, JoinInput, QueueService, TokenRef, Unsubscribe } from "../types";
import { getSupabaseClient } from "./client";

export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("already_in_queue")) return new DomainError("already_in_queue");
  if (msg.includes("location_stale")) return new DomainError("location_stale");
  if (msg.includes("location_inaccurate")) return new DomainError("location_inaccurate");
  if (msg.includes("too_far")) return new DomainError("too_far");
  if (msg.includes("location_required")) return new DomainError("location_required");
  if (msg.includes("branch_closed")) return new DomainError("branch_closed");
  if (msg.includes("branch_not_found")) return new DomainError("branch_not_found");
  if (msg.includes("service_not_found")) return new DomainError("service_not_found");
  if (msg.includes("token_not_found")) return new DomainError("token_not_found");
  if (msg.includes("booking_not_found")) return new DomainError("booking_not_found");
  if (msg.includes("booking_not_cancellable")) return new DomainError("booking_not_cancellable");
  if (msg.includes("booking_window")) return new DomainError("booking_window");
  if (msg.includes("slot_unavailable")) return new DomainError("slot_unavailable");
  if (msg.includes("slot_in_past")) return new DomainError("slot_in_past");
  if (msg.includes("invalid_credentials")) return new DomainError("invalid_credentials");
  if (msg.includes("account_locked")) return new DomainError("account_locked");
  if (msg.includes("no_more_time") || msg.includes("no_more_extensions")) return new DomainError("no_more_time");
  if (msg.includes("not_signed_in")) return new DomainError("not_signed_in");
  return new DomainError("unknown", msg);
}

export function mapTokenView(row: Record<string, unknown>, now: EpochMs = clock.now()): TokenView {
  const avg = Number(row.avg_service_min ?? 6);
  const counters = Math.max(1, Number(row.counters ?? 1));
  const ahead = Number(row.ahead ?? 0);
  const aheadAtJoin = Number(row.ahead_at_join ?? ahead);

  const joinedAt = Number(row.joined_at ?? now);
  const calledAt = row.called_at != null ? Number(row.called_at) : null;
  const callDeadline = row.call_deadline != null ? Number(row.call_deadline) : null;
  const checkinDeadline = row.checkin_deadline != null ? Number(row.checkin_deadline) : null;
  const servedAt = row.served_at != null ? Number(row.served_at) : null;

  const estWait = estimateWait(ahead, avg, counters);
  const usualWait = estimateWait(aheadAtJoin, avg, counters);

  return {
    id: String(row.id),
    code: String(row.code),
    number: Number(row.number),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name ?? ""),
    branchSlug: String(row.branch_slug ?? ""),
    bankName: String(row.bank_name ?? ""),
    bankSlug: String(row.bank_slug ?? ""),
    serviceId: String(row.service_id),
    serviceName: String(row.service_name ?? ""),
    groupId: String(row.group_id),
    source: (row.source as TokenSource) ?? "walk_in",
    priority: (row.priority as PriorityTag[]) ?? [],
    stage: (row.stage as TokenStage) ?? "waiting",
    movedBack: Number(row.moved_back ?? 0),
    ahead,
    position: Number(row.position ?? ahead + 1),
    nowServingCode: row.now_serving_code ? String(row.now_serving_code) : null,
    estWait,
    usualWait,
    counter: row.counter != null ? Number(row.counter) : null,
    counterIsAssigned: Boolean(row.counter_is_assigned),
    joinedAt,
    calledAt,
    callDeadline,
    checkinDeadline,
    canRequestMoreTime: Boolean(row.can_request_more_time),
    onMyWay: Boolean(row.on_my_way),
    servedAt,
    waitedMs: row.waited_ms != null ? Number(row.waited_ms) : null,
    savedMs: row.saved_ms != null ? Number(row.saved_ms) : null,
    feedback: (row.feedback as TokenFeedback) ?? null,
    bring: Array.isArray(row.bring) ? (row.bring as string[]) : [],
    updatedAt: now,
  };
}

export function createQueueService(client?: SupabaseClient): QueueService {
  const sb = client ?? getSupabaseClient();

  const fetchTokenViewById = async (id: ID): Promise<TokenView> => {
    const { data, error } = await sb
      .from("token_view")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw toDomainError(error);
    if (!data) throw new DomainError("token_not_found");
    return mapTokenView(data as Record<string, unknown>);
  };

  return {
    async active(): Promise<TokenView | null> {
      try {
        const { data: userRes } = await sb.auth.getUser();
        if (!userRes?.user) return null;

        const { data, error } = await sb
          .from("token_view")
          .select("*")
          .eq("user_id", userRes.user.id)
          .in("stage", ["waiting", "checkin", "called", "serving"])
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw toDomainError(error);
        if (!data) return null;
        return mapTokenView(data as Record<string, unknown>);
      } catch (e) {
        if (e instanceof DomainError && e.code === "not_signed_in") return null;
        throw e;
      }
    },

    async get(ref: TokenRef): Promise<TokenView> {
      if ("id" in ref) {
        return fetchTokenViewById(ref.id);
      }
      const { data, error } = await sb
        .from("token_view")
        .select("*")
        .ilike("code", ref.code)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw toDomainError(error);
      if (!data) throw new DomainError("token_not_found");
      return mapTokenView(data as Record<string, unknown>);
    },

    async join(input: JoinInput): Promise<TokenView> {
      try {
        const proof = input.proof;
        if (!proof) throw new DomainError("location_required");

        const { data: tokenId, error } = await sb.rpc("join_queue", {
          p_branch_id: input.branchId,
          p_service_id: input.serviceId,
          p_priority: input.priority,
          p_proof_lat: proof.lat,
          p_proof_lng: proof.lng,
          p_proof_accuracy: proof.accuracyM,
          p_proof_captured_at: proof.capturedAt,
        });

        if (error) throw toDomainError(error);
        return fetchTokenViewById(String(tokenId));
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async checkInBooking(input: CheckInBookingInput): Promise<TokenView> {
      try {
        const proof = input.proof;
        if (!proof) throw new DomainError("location_required");

        const { data: tokenId, error } = await sb.rpc("checkin_booking", {
          p_booking_id: input.bookingId,
          p_proof_lat: proof.lat,
          p_proof_lng: proof.lng,
          p_proof_accuracy: proof.accuracyM,
          p_proof_captured_at: proof.capturedAt,
        });

        if (error) throw toDomainError(error);
        return fetchTokenViewById(String(tokenId));
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async confirmCheckin(id: ID, proof: LocationProof): Promise<TokenView> {
      try {
        if (!proof) throw new DomainError("location_required");
        const { error } = await sb.rpc("confirm_checkin", {
          p_token_id: id,
          p_proof_lat: proof.lat,
          p_proof_lng: proof.lng,
          p_proof_accuracy: proof.accuracyM,
          p_proof_captured_at: proof.capturedAt,
        });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async moveBack(id: ID): Promise<TokenView> {
      try {
        const { error } = await sb.rpc("move_back", { p_token_id: id });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async onMyWay(id: ID): Promise<TokenView> {
      try {
        const { error } = await sb.rpc("on_my_way", { p_token_id: id });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async requestMoreTime(id: ID): Promise<TokenView> {
      try {
        const { error } = await sb.rpc("request_more_time", { p_token_id: id });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async leave(id: ID): Promise<TokenView> {
      try {
        const { error } = await sb.rpc("leave_queue", { p_token_id: id });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async sendFeedback(id: ID, feedback: TokenFeedback): Promise<TokenView> {
      try {
        const { error } = await sb.rpc("send_token_feedback", {
          p_token_id: id,
          p_feedback: feedback,
        });
        if (error) throw toDomainError(error);
        return fetchTokenViewById(id);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    subscribe(onChange: () => void): Unsubscribe {
      const channel = sb
        .channel("tokens_subscription")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tokens" },
          () => onChange(),
        )
        .subscribe();

      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}

export const createSupabaseQueueService = createQueueService;
