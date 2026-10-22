/**
 * Sample staff accounts for the mock adapter. ALL OF THIS IS SAMPLE DATA.
 * Real accounts are created by the branch admin and live in the backend (`staff`, `rosters`
 * tables, see docs/backend-handoff.md). PINs are never stored in the clear there.
 */
import type { ID, StaffMember } from "@/domain";

/** Every sample account uses this PIN. The sign in screen shows it in demo mode. */
export const DEMO_PIN = "4821";

export interface StaffAccount extends StaffMember {
  /** The counter the roster assigns today. */
  counter: number;
  shiftStart: string;
  shiftEnd: string;
}

const acct = (n: number, employeeId: string, name: string, branchId: ID, counter: number, shiftStart: string, shiftEnd: string): StaffAccount => ({
  id: `stf_${n}`, employeeId, name, branchId, role: "teller", counter, shiftStart, shiftEnd,
});

export const STAFF_ACCOUNTS: StaffAccount[] = [
  acct(1, "E48213", "Meera Joshi", "br_sbi_main_road", 4, "09:30", "13:30"),
  acct(2, "E48214", "Arjun Patel", "br_sbi_main_road", 5, "10:00", "14:00"),
  acct(3, "E48101", "Kavita Shah", "br_sbi_main_road", 1, "10:00", "14:00"),
  acct(4, "E48310", "Imran Khan", "br_sbi_main_road", 3, "10:00", "16:00"),
  acct(5, "E52007", "Neha Desai", "br_bob_navrangpura", 4, "10:00", "14:00"),
];

export const accountByEmployeeId = (employeeId: string) => STAFF_ACCOUNTS.find((a) => a.employeeId === employeeId);
export const accountById = (id: ID) => STAFF_ACCOUNTS.find((a) => a.id === id);
