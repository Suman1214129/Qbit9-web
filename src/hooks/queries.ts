"use client";
import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/providers/services-provider";
import { keys } from "./keys";

export function useSession() {
  const { auth } = useServices();
  return useQuery({ queryKey: keys.session, queryFn: () => auth.getSession(), staleTime: 60_000 });
}

export function useBranches() {
  const { branches } = useServices();
  return useQuery({ queryKey: keys.branches, queryFn: () => branches.list(), staleTime: 5 * 60_000 });
}

export function useBranch(bank: string, slug: string) {
  const { branches } = useServices();
  return useQuery({ queryKey: keys.branch(bank, slug), queryFn: () => branches.bySlug(bank, slug), staleTime: 5 * 60_000 });
}

export function useBranchById(id: string | null | undefined) {
  const { branches } = useServices();
  return useQuery({ queryKey: keys.branchById(id ?? ""), queryFn: () => branches.byId(id as string), enabled: !!id, staleTime: 5 * 60_000 });
}

export function useSnapshot(branchId: string | null | undefined) {
  const { branches } = useServices();
  return useQuery({ queryKey: keys.snapshot(branchId ?? ""), queryFn: () => branches.snapshot(branchId as string), enabled: !!branchId, refetchInterval: 20_000 });
}

export function useSnapshots(ids: string[]) {
  const { branches } = useServices();
  return useQuery({ queryKey: ["snapshots", ...ids], queryFn: () => branches.snapshots(ids), enabled: ids.length > 0, refetchInterval: 30_000 });
}

export function useCatalogue(branchId: string | null | undefined) {
  const { branches } = useServices();
  return useQuery({ queryKey: keys.catalogue(branchId ?? ""), queryFn: () => branches.catalogue(branchId as string), enabled: !!branchId, refetchInterval: 20_000 });
}

export function useActiveToken(enabled = true) {
  const { queue } = useServices();
  return useQuery({ queryKey: keys.active, queryFn: () => queue.active(), enabled, staleTime: 5_000 });
}

export function useToken(code: string) {
  const { queue } = useServices();
  return useQuery({ queryKey: keys.token(code), queryFn: () => queue.get({ code }), staleTime: 2_000 });
}

export function useBookings(enabled = true) {
  const { bookings } = useServices();
  return useQuery({ queryKey: keys.bookings, queryFn: () => bookings.list(), enabled, refetchInterval: 60_000 });
}

export function useAvailability(branchId: string | null | undefined, serviceId: string | null | undefined) {
  const { bookings } = useServices();
  return useQuery({
    queryKey: keys.availability(branchId ?? "", serviceId ?? ""),
    queryFn: () => bookings.availability(branchId as string, serviceId as string),
    enabled: !!branchId && !!serviceId,
    staleTime: 30_000,
  });
}

export function useHistory(enabled = true) {
  const { history } = useServices();
  return useQuery({ queryKey: keys.history, queryFn: () => history.list(), enabled });
}

export function usePreferences(enabled = true) {
  const { preferences } = useServices();
  return useQuery({ queryKey: keys.prefs, queryFn: () => preferences.get(), enabled });
}
