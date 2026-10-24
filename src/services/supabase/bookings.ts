import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_POLICY,
  DomainError,
  buildAvailability,
  canCancelBooking,
  canCheckInBooking,
  type BookingStatus,
  type BookingView,
  type DayAvailability,
  type DayHours,
  type EpochMs,
  type ID,
} from "@/domain";
import { clock } from "@/lib/clock";
import type { BookingService, CreateBookingInput } from "../types";
import { getSupabaseClient } from "./client";
import { toDomainError } from "./queue";

function mapBookingView(
  row: Record<string, unknown>,
  branchName: string,
  serviceName: string,
  bring: string[],
  now: EpochMs,
): BookingView {
  const startsAt = new Date(String(row.starts_at)).getTime();
  const status = (row.status as BookingStatus) ?? "upcoming";

  return {
    id: String(row.id),
    userId: String(row.user_id),
    branchId: String(row.branch_id),
    serviceId: String(row.service_id),
    startsAt,
    durationMin: Number(row.duration_min ?? 30),
    status,
    createdAt: new Date(String(row.created_at)).getTime(),
    tokenId: row.token_id ? String(row.token_id) : null,
    branchName,
    serviceName,
    bring,
    canCheckIn: status === "upcoming" && canCheckInBooking(startsAt, now),
    canCancel: status === "upcoming" && canCancelBooking(startsAt, now),
  };
}

export function createBookingService(client?: SupabaseClient): BookingService {
  const sb = client ?? getSupabaseClient();

  const getBranch = async (branchId: ID) => {
    const { data, error } = await sb.from("branches").select("*").eq("id", branchId).maybeSingle();
    if (error || !data) throw new DomainError("branch_not_found");
    return data as Record<string, unknown>;
  };

  const getService = async (serviceId: ID) => {
    const { data, error } = await sb.from("services").select("*").eq("id", serviceId).maybeSingle();
    if (error || !data) throw new DomainError("service_not_found");
    return data as Record<string, unknown>;
  };

  const getCountersCount = async (branchId: ID, groupId: ID) => {
    const { data } = await sb
      .from("counters")
      .select("id, counter_groups!inner(group_id)")
      .eq("branch_id", branchId)
      .eq("counter_groups.group_id", groupId);

    return Math.max(1, data?.length ?? 1);
  };

  const fetchBookingView = async (id: ID, now: EpochMs): Promise<BookingView> => {
    const { data, error } = await sb.from("bookings").select("*").eq("id", id).maybeSingle();
    if (error) throw toDomainError(error);
    if (!data) throw new DomainError("booking_not_found");

    const branch = await getBranch(String(data.branch_id));
    const service = await getService(String(data.service_id));

    return mapBookingView(
      data as Record<string, unknown>,
      String(branch.name ?? "Branch"),
      String(service.name ?? "Service"),
      Array.isArray(service.bring) ? (service.bring as string[]) : [],
      now,
    );
  };

  return {
    async availability(branchId: ID, serviceId: ID): Promise<DayAvailability[]> {
      const now = clock.now();
      const branchRow = await getBranch(branchId);
      const serviceRow = await getService(serviceId);
      if (!serviceRow.bookable) throw new DomainError("service_not_found");

      const capacity = await getCountersCount(branchId, String(serviceRow.group_id));

      const branch = {
        hours: branchRow.hours as DayHours[],
        closedDates: (branchRow.closed_dates as string[]) ?? [],
        timezone: String(branchRow.timezone ?? "Asia/Kolkata"),
      };

      // Query taken slots
      const { data: slotCapacities } = await sb
        .from("slot_capacity")
        .select("slot_start, booked_count")
        .eq("branch_id", branchId)
        .eq("service_id", serviceId);

      const takenMap = new Map<number, number>();
      if (slotCapacities) {
        for (const sc of slotCapacities) {
          const t = new Date(String(sc.slot_start)).getTime();
          takenMap.set(t, Number(sc.booked_count ?? 0));
        }
      }

      return buildAvailability({
        branch,
        now,
        capacity,
        taken: (t) => takenMap.get(t) ?? 0,
        policy: DEFAULT_POLICY,
      });
    },

    async list(): Promise<BookingView[]> {
      const now = clock.now();
      const { data: userRes } = await sb.auth.getUser();
      if (!userRes?.user) return [];

      const { data, error } = await sb
        .from("bookings")
        .select("*")
        .eq("user_id", userRes.user.id)
        .order("starts_at", { ascending: true });

      if (error) throw toDomainError(error);
      if (!data) return [];

      const views: BookingView[] = [];
      for (const row of data) {
        const branch = await getBranch(String(row.branch_id));
        const service = await getService(String(row.service_id));
        views.push(
          mapBookingView(
            row as Record<string, unknown>,
            String(branch.name ?? "Branch"),
            String(service.name ?? "Service"),
            Array.isArray(service.bring) ? (service.bring as string[]) : [],
            now,
          ),
        );
      }
      return views;
    },

    async get(id: ID): Promise<BookingView> {
      const now = clock.now();
      return fetchBookingView(id, now);
    },

    async create(input: CreateBookingInput): Promise<BookingView> {
      try {
        const now = clock.now();
        const { data: bookingId, error } = await sb.rpc("create_booking", {
          p_branch_id: input.branchId,
          p_service_id: input.serviceId,
          p_starts_at: new Date(input.startsAt).toISOString(),
        });

        if (error) throw toDomainError(error);
        return fetchBookingView(String(bookingId), now);
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async cancel(id: ID): Promise<BookingView> {
      try {
        const now = clock.now();
        const { error } = await sb.rpc("cancel_booking", { p_booking_id: id });
        if (error) throw toDomainError(error);
        return fetchBookingView(id, now);
      } catch (err) {
        throw toDomainError(err);
      }
    },
  };
}

export const createSupabaseBookingService = createBookingService;
