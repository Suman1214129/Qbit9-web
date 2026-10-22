"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BreakReason, ID, PriorityTag } from "@/domain";
import { useServices } from "@/providers/services-provider";
import type { CallOptions, CounterState, StaffLoginInput } from "@/services/staff-types";
import { staffKeys } from "./keys";

/** After anything that changes the floor, every staff view may be stale. */
function useRefreshStaff() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: staffKeys.queues }),
    qc.invalidateQueries({ queryKey: staffKeys.today }),
    qc.invalidateQueries({ queryKey: staffKeys.roster }),
  ]);
}

export function useStaffSignIn() {
  const { staff } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffLoginInput) => staff.signIn(input),
    onSuccess: (session) => {
      qc.setQueryData(staffKeys.session, session);
      void qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useStaffSignOut() {
  const { staff } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => staff.signOut(),
    onSuccess: () => {
      qc.setQueryData(staffKeys.session, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === "staff" && q.queryKey[1] !== "session" });
    },
  });
}

/** One hook per counter action. Each stores the fresh counter state the service returns. */
function useCounterAction<V>(run: (v: V) => Promise<CounterState>) {
  const qc = useQueryClient();
  const refresh = useRefreshStaff();
  return useMutation({
    mutationFn: run,
    onSuccess: (state) => {
      qc.setQueryData(staffKeys.counter, state);
      void refresh();
    },
  });
}

export function useStartShift() {
  const { staff } = useServices();
  return useCounterAction<number | undefined>((counter) => staff.startShift(counter));
}
export function useStartBreak() {
  const { staff } = useServices();
  return useCounterAction<BreakReason>((r) => staff.startBreak(r));
}
export function useResumeFromBreak() {
  const { staff } = useServices();
  return useCounterAction<void>(() => staff.resumeFromBreak());
}
export function useCallNext() {
  const { staff } = useServices();
  return useCounterAction<CallOptions | undefined>((o) => staff.callNext(o));
}
export function useFinishCurrent() {
  const { staff } = useServices();
  return useCounterAction<"served" | "no_show" | undefined>((as) => staff.finishCurrent(as));
}
export function useRecall() {
  const { staff } = useServices();
  return useCounterAction<void>(() => staff.recall());
}
export function useTransfer() {
  const { staff } = useServices();
  return useCounterAction<number>((n) => staff.transfer(n));
}
export function useHold() {
  const { staff } = useServices();
  return useCounterAction<void>(() => staff.hold());
}
export function useResume() {
  const { staff } = useServices();
  return useCounterAction<ID>((id) => staff.resume(id));
}
export function useSetNote() {
  const { staff } = useServices();
  return useCounterAction<string>((n) => staff.setNote(n));
}
export function useSnoozeNudge() {
  const { staff } = useServices();
  return useCounterAction<void>(() => staff.snoozeNudge());
}

export function useEndShift() {
  const { staff } = useServices();
  const qc = useQueryClient();
  const refresh = useRefreshStaff();
  return useMutation({
    mutationFn: () => staff.endShift(),
    onSuccess: (roster) => {
      qc.setQueryData(staffKeys.roster, roster);
      qc.removeQueries({ queryKey: staffKeys.counter });
      void refresh();
    },
  });
}

export function useIssueWalkIn() {
  const { staff } = useServices();
  const refresh = useRefreshStaff();
  return useMutation({
    mutationFn: (v: { name: string; phone: string; serviceId: ID; priority: PriorityTag[] }) => staff.issueWalkIn(v),
    onSuccess: () => void refresh(),
  });
}

export function useUndoClosure() {
  const { staff } = useServices();
  const qc = useQueryClient();
  const refresh = useRefreshStaff();
  return useMutation({
    mutationFn: (id: ID) => staff.undoClosure(id),
    onSuccess: (today) => {
      qc.setQueryData(staffKeys.today, today);
      void qc.invalidateQueries({ queryKey: staffKeys.counter });
      void refresh();
    },
  });
}
