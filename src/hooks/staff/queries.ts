"use client";
import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/providers/services-provider";
import type { QueueScope } from "@/services/staff-types";
import { staffKeys } from "./keys";

/** Staff screens read time-driven state (timers, simulated arrivals), so they refresh often. */
const LIVE_MS = 3_000;

export function useStaffSession() {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.session, queryFn: () => staff.getSession(), staleTime: 60_000 });
}

export function useRoster(enabled = true) {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.roster, queryFn: () => staff.roster(), enabled, refetchInterval: 10_000 });
}

export function useCounter(enabled = true) {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.counter, queryFn: () => staff.counter(), enabled, refetchInterval: LIVE_MS, retry: false });
}

export function useStaffQueue(scope: QueueScope, enabled = true) {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.queue(scope), queryFn: () => staff.queue(scope), enabled, refetchInterval: LIVE_MS });
}

export function useStaffToday(enabled = true) {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.today, queryFn: () => staff.today(), enabled, refetchInterval: 5_000 });
}

export function useWalkInServices(enabled = true) {
  const { staff } = useServices();
  return useQuery({ queryKey: staffKeys.walkInServices, queryFn: () => staff.walkInServices(), enabled, staleTime: 5 * 60_000 });
}
