"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OtpChannel, Preferences, TokenFeedback } from "@/domain";
import { useServices } from "@/providers/services-provider";
import type { CheckInBookingInput, CreateBookingInput, JoinInput, ProfilePatch, VerifyInput } from "@/services/types";
import { keys } from "./keys";

/** Everything that can change after a token action refreshes the same set of queries. */
function useRefreshQueue() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: keys.active }), qc.invalidateQueries({ queryKey: keys.tokens }), qc.invalidateQueries({ queryKey: keys.history }), qc.invalidateQueries({ queryKey: keys.bookings })]);
}

export function useRequestOtp() {
  const { auth } = useServices();
  return useMutation({ mutationFn: (v: { channel: OtpChannel; identifier: string }) => auth.requestOtp(v.channel, v.identifier) });
}

export function useVerifyOtp() {
  const { auth } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: VerifyInput) => auth.verifyOtp(v),
    onSuccess: async (session) => {
      qc.setQueryData(keys.session, session);
      await Promise.all([qc.invalidateQueries({ queryKey: keys.active }), qc.invalidateQueries({ queryKey: keys.prefs })]);
    },
  });
}

export function useSignOut() {
  const { auth } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => auth.signOut(),
    onSuccess: () => {
      qc.setQueryData(keys.session, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" && q.queryKey[0] !== "branches" });
    },
  });
}

export function useDeleteAccount() {
  const { auth } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => auth.deleteAccount(),
    onSuccess: () => {
      qc.setQueryData(keys.session, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" && q.queryKey[0] !== "branches" });
    },
  });
}

export function useUpdateProfile() {
  const { auth } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => auth.updateProfile(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.session }),
  });
}

export function useUpdatePreferences() {
  const { preferences } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Preferences>) => preferences.update(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.prefs });
      const prev = qc.getQueryData<Preferences>(keys.prefs);
      if (prev) qc.setQueryData(keys.prefs, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(keys.prefs, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.prefs }),
  });
}

export function useToggleSavedBranch() {
  const { preferences } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId: string) => preferences.toggleSavedBranch(branchId),
    onSuccess: (p) => qc.setQueryData(keys.prefs, p),
  });
}

export function useJoinQueue() {
  const { queue } = useServices();
  const refresh = useRefreshQueue();
  return useMutation({ mutationFn: (i: JoinInput) => queue.join(i), onSuccess: refresh });
}

export function useCheckInBooking() {
  const { queue } = useServices();
  const refresh = useRefreshQueue();
  return useMutation({ mutationFn: (i: CheckInBookingInput) => queue.checkInBooking(i), onSuccess: refresh });
}

type TokenAction = "moveBack" | "onMyWay" | "requestMoreTime" | "leave";

export function useTokenAction(action: TokenAction) {
  const { queue } = useServices();
  const refresh = useRefreshQueue();
  return useMutation({ mutationFn: (id: string) => queue[action](id), onSuccess: refresh });
}

export function useConfirmCheckin() {
  const { queue } = useServices();
  const refresh = useRefreshQueue();
  return useMutation({ mutationFn: (v: { id: string; proof: Parameters<typeof queue.confirmCheckin>[1] }) => queue.confirmCheckin(v.id, v.proof), onSuccess: refresh });
}

export function useSendFeedback() {
  const { queue } = useServices();
  const refresh = useRefreshQueue();
  return useMutation({ mutationFn: (v: { id: string; feedback: TokenFeedback }) => queue.sendFeedback(v.id, v.feedback), onSuccess: refresh });
}

export function useCreateBooking() {
  const { bookings } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: CreateBookingInput) => bookings.create(i),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: keys.bookings }), qc.invalidateQueries({ queryKey: ["availability"] }), qc.invalidateQueries({ queryKey: keys.history })]),
    onError: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useCancelBooking() {
  const { bookings } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bookings.cancel(id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: keys.bookings }), qc.invalidateQueries({ queryKey: ["availability"] }), qc.invalidateQueries({ queryKey: keys.history })]),
  });
}
