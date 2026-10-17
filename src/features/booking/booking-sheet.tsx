"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, InlineNote, Sheet, StatRow } from "@/components/ui";
import { DEFAULT_POLICY, bookingWindows, formatClock, formatSlotFull, type BookingView } from "@/domain";
import { useCancelBooking, useCheckInBooking } from "@/hooks/mutations";
import { useBranchById } from "@/hooks/queries";
import { useLocationCheck } from "@/hooks/use-location-check";
import { buildIcs, downloadFile } from "@/lib/ics";
import { errorMessage } from "@/lib/errors";
import { formatDistance } from "@/lib/format";
import { BringList } from "@/features/token/token-details";

const TZ = "Asia/Kolkata";

export function addToCalendar(b: BookingView, branchAddress?: string) {
  downloadFile(
    `qbit9-${b.id}.ics`,
    buildIcs({
      uid: b.id,
      title: `${b.serviceName} at ${b.branchName}`,
      startsAt: b.startsAt,
      durationMin: Math.max(15, b.durationMin),
      location: `${b.branchName}${branchAddress ? `, ${branchAddress}` : ""}`,
      description: `Booked with QBIT9. Check in from 30 minutes before. Bring: ${b.bring.join("; ")}`,
    }),
    "text/calendar",
  );
}

/** Details of one booking: what to bring, check in when the window opens, cancel until the cut-off. */
export function BookingSheet({ booking, onClose }: { booking: BookingView | null; onClose: () => void }) {
  const router = useRouter();
  const { data: branch } = useBranchById(booking?.branchId);
  const { check } = useLocationCheck(branch);
  const checkIn = useCheckInBooking();
  const cancel = useCancelBooking();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!booking) return <Sheet open={false} onClose={onClose} title="Booking"><span /></Sheet>;
  const w = bookingWindows(booking.startsAt, DEFAULT_POLICY);

  const doCheckIn = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const s = await check();
      if (s.status === "failed") return setProblem("We need your location once to check you in. Allow it in your browser and try again.");
      if (s.status !== "ready") return;
      if (s.result.status === "too_far") return setProblem(`You are about ${formatDistance(s.result.distanceM)} from the branch. Check in when you arrive.`);
      if (s.result.status !== "within") return setProblem("Your location is not precise enough. Try again near a window.");
      const token = await checkIn.mutateAsync({ bookingId: booking.id, proof: s.proof });
      onClose();
      router.push(`/token/${token.code}?new=1`);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    try {
      await cancel.mutateAsync(booking.id);
      setConfirmCancel(false);
      onClose();
    } catch (e) {
      setProblem(errorMessage(e));
      setConfirmCancel(false);
    }
  };

  const status =
    booking.status === "upcoming" ? <Chip tone="lavender">Upcoming</Chip> :
    booking.status === "checked_in" ? <Chip tone="rose">Checked in</Chip> :
    booking.status === "completed" ? <Chip tone="ok">Done</Chip> :
    <Chip tone="off">{booking.status === "cancelled" ? "Cancelled" : "Missed"}</Chip>;

  return (
    <>
      <Sheet open onClose={onClose} title={booking.serviceName}>
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">{status}</div>
          <div>
            <StatRow label="When">{formatSlotFull(booking.startsAt, TZ)}</StatRow>
            <StatRow label="Where">{booking.branchName}</StatRow>
            {booking.status === "upcoming" ? <StatRow label="Check in opens">{formatClock(w.checkinOpensAt, TZ)}</StatRow> : null}
            {booking.status === "upcoming" ? <StatRow label="We hold your slot until">{formatClock(w.holdsUntil, TZ)}</StatRow> : null}
          </div>
          <BringList items={booking.bring} />
          {problem ? <InlineNote tone="warn" icon="warn">{problem}</InlineNote> : null}
          {booking.status === "upcoming" ? (
            <div className="flex flex-col gap-2.5">
              {booking.canCheckIn ? (
                <Button icon="pin" loading={busy || checkIn.isPending} onClick={doCheckIn}>Check in at the branch</Button>
              ) : (
                <InlineNote icon="clock">Check in opens 30 minutes before your slot, at {formatClock(w.checkinOpensAt, TZ)}.</InlineNote>
              )}
              <Button variant="outline" size="sm" icon="download" className="h-11" onClick={() => addToCalendar(booking, branch?.address)}>Add to calendar</Button>
              {booking.canCancel ? <Button variant="link" onClick={() => setConfirmCancel(true)}>Cancel this booking</Button> : <p className="text-center text-xs text-muted">Too close to the visit time to cancel online.</p>}
            </div>
          ) : booking.status === "checked_in" && booking.tokenId ? (
            <Button icon="ticket" href="/home">Go to my token</Button>
          ) : (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </div>
      </Sheet>
      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this booking?" variant="dialog">
        <p className="mt-2 text-sm leading-snug text-muted">{booking.serviceName}, {formatSlotFull(booking.startsAt, TZ)}. The slot goes back to other customers.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setConfirmCancel(false)} className="h-11 flex-1 rounded-xl bg-bg font-medium">Keep it</button>
          <button type="button" disabled={cancel.isPending} onClick={doCancel} className="h-11 flex-1 rounded-xl bg-rust font-medium text-white disabled:opacity-60">Cancel booking</button>
        </div>
      </Sheet>
    </>
  );
}

