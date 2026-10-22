/**
 * Sample catalogue for the mock adapter: banks, branches, services and the ambient queue.
 * ALL OF THIS IS SAMPLE DATA. The real catalogue comes from the backend (`banks`, `branches`,
 * `service_groups`, `services`, `counters` tables, see docs/backend-handoff.md).
 */
import {
  addDaysKey, nthWeekdayOfMonth, tzParts, weekdayOfKey, estimateWait,
  type Bank, type Branch, type DayHours, type EpochMs, type ID, type Service, type ServiceGroup, type ServiceGroupLive,
} from "@/domain";
import { waitingInGroup } from "./staff/live";
import { counterNumbersOnBreak } from "./staff/store";

export const BANKS: Bank[] = [
  { id: "bank_sbi", slug: "sbi", name: "State Bank of India", shortName: "SBI" },
  { id: "bank_bob", slug: "bob", name: "Bank of Baroda", shortName: "BoB" },
];

const svc = (id: string, groupId: string, name: string, avgServiceMin: number, bring: string[], bookable = true): Service => ({
  id, groupId, name, avgServiceMin, bring, bookable,
});

export const GROUPS: ServiceGroup[] = [
  {
    id: "grp_cash", name: "Cash and cheques", tokenPrefix: "C",
    services: [
      svc("svc_cash", "grp_cash", "Cash deposit or withdrawal", 6, ["Passbook or account number", "Filled deposit or withdrawal slip", "PAN card if depositing ₹50,000 or more"], false),
      svc("svc_cheque", "grp_cash", "Cheque deposit", 4, ["Cheque, signed on the back", "Paying in slip", "Passbook or account number"], false),
      svc("svc_dd", "grp_cash", "Demand draft", 8, ["Filled DD application form", "ID proof", "Cash or account details for payment"]),
    ],
  },
  {
    id: "grp_accounts", name: "Accounts", tokenPrefix: "A",
    services: [
      svc("svc_open", "grp_accounts", "Open an account", 18, ["Aadhaar card", "PAN card", "Two passport size photos"]),
      svc("svc_passbook", "grp_accounts", "Passbook update", 3, ["Passbook"], false),
      svc("svc_kyc", "grp_accounts", "KYC update", 9, ["Aadhaar card", "PAN card", "Proof of address if it changed"]),
      svc("svc_statement", "grp_accounts", "Statement or account enquiry", 6, ["Passbook or account number", "ID proof"]),
    ],
  },
  {
    id: "grp_loans", name: "Loans", tokenPrefix: "L",
    services: [
      svc("svc_loan", "grp_loans", "Loan enquiry", 20, ["ID and address proof", "Last 3 months salary slips or ITR", "Bank statement for 6 months"]),
      svc("svc_loandocs", "grp_loans", "Loan documents", 12, ["Loan reference number", "Original documents asked for by the officer"]),
    ],
  },
  {
    id: "grp_lockers", name: "Lockers and cards", tokenPrefix: "K",
    services: [
      svc("svc_locker", "grp_lockers", "Locker access or enquiry", 10, ["Locker key", "ID proof"]),
      svc("svc_debit", "grp_lockers", "Debit card issue or block", 8, ["Account number", "ID proof"]),
      svc("svc_credit", "grp_lockers", "Credit card service", 12, ["Card details if you have one", "ID proof"]),
    ],
  },
];

/** Typical queue length per service at a busy branch (before the branch factor and wobble). */
const SERVICE_LOAD: Record<string, number> = {
  svc_cash: 7, svc_cheque: 5, svc_dd: 2,
  svc_open: 3, svc_passbook: 4, svc_kyc: 2, svc_statement: 2,
  svc_loan: 1, svc_loandocs: 1,
  svc_locker: 1, svc_debit: 2, svc_credit: 1,
};

const hours = (weekday: DayHours, saturday: DayHours): DayHours[] => [null, weekday, weekday, weekday, weekday, weekday, saturday];
const STANDARD_HOURS = hours({ open: "10:00", close: "16:00" }, { open: "10:00", close: "14:00" });

interface BranchSeed {
  id: ID; bankSlug: string; slug: string; name: string; address: string; area: string; lat: number; lng: number;
  factor: number; cashCounters: number;
}

const SEEDS: BranchSeed[] = [
  { id: "br_sbi_main_road", bankSlug: "sbi", slug: "main-road", name: "Main Road Branch", address: "Main Road, Ellisbridge", area: "Ellisbridge", lat: 23.0225, lng: 72.5714, factor: 1, cashCounters: 2 },
  { id: "br_sbi_ring_road", bankSlug: "sbi", slug: "ring-road", name: "Ring Road Branch", address: "Ring Road, Paldi", area: "Paldi", lat: 23.0121, lng: 72.5593, factor: 0.6, cashCounters: 2 },
  { id: "br_sbi_station_road", bankSlug: "sbi", slug: "station-road", name: "Station Road Branch", address: "Station Road, Kalupur", area: "Kalupur", lat: 23.0258, lng: 72.6012, factor: 1.4, cashCounters: 3 },
  { id: "br_bob_navrangpura", bankSlug: "bob", slug: "navrangpura", name: "Navrangpura Branch", address: "CG Road, Navrangpura", area: "Navrangpura", lat: 23.0366, lng: 72.5611, factor: 0.8, cashCounters: 2 },
  { id: "br_bob_satellite", bankSlug: "bob", slug: "satellite", name: "Satellite Branch", address: "Satellite Road", area: "Satellite", lat: 23.03, lng: 72.529, factor: 0.5, cashCounters: 2 },
];

const factorByBranch = new Map(SEEDS.map((s) => [s.id, s.factor]));

/** Banks close on the 2nd and 4th Saturdays. Computed around `now` so the sample stays current. */
function closedDatesAround(now: EpochMs, tz: string): string[] {
  const today = tzParts(now, tz).dateKey;
  const out: string[] = [];
  for (let i = -45; i <= 90; i++) {
    const key = addDaysKey(today, i);
    if (weekdayOfKey(key) !== 6) continue;
    const n = nthWeekdayOfMonth(key);
    if (n === 2 || n === 4) out.push(key);
  }
  return out;
}

let cache: { day: string; branches: Branch[] } | null = null;

export function getBranches(now: EpochMs): Branch[] {
  const tz = "Asia/Kolkata";
  const day = tzParts(now, tz).dateKey;
  if (cache?.day === day) return cache.branches;
  const closedDates = closedDatesAround(now, tz);
  const branches = SEEDS.map<Branch>((s) => {
    const bank = BANKS.find((b) => b.slug === s.bankSlug) as Bank;
    const c = s.cashCounters;
    return {
      id: s.id, bankId: bank.id, bank, slug: s.slug, name: s.name, address: s.address, area: s.area, city: "Ahmedabad",
      location: { lat: s.lat, lng: s.lng }, joinRadiusM: 200, timezone: tz, hours: STANDARD_HOURS, closedDates,
      counters: [
        ...Array.from({ length: c }, (_, i) => ({ number: 4 + i, groupIds: ["grp_cash"] })),
        { number: 1, groupIds: ["grp_accounts"] },
        { number: 2, groupIds: ["grp_accounts"] },
        { number: 3, groupIds: ["grp_loans"] },
        { number: 4 + c, groupIds: ["grp_lockers"] },
      ].sort((a, b) => a.number - b.number),
    };
  });
  cache = { day, branches };
  return branches;
}

export function findService(serviceId: ID): { group: ServiceGroup; service: Service } | null {
  for (const group of GROUPS) {
    const service = group.services.find((s) => s.id === serviceId);
    if (service) return { group, service };
  }
  return null;
}

export function countersFor(branch: Branch, groupId: ID): number[] {
  // Counters whose staff are on a break do not count while they are away (see staff/store.ts).
  const away = counterNumbersOnBreak(branch.id);
  return branch.counters.filter((c) => c.groupIds.includes(groupId) && !away.includes(c.number)).map((c) => c.number).sort((a, b) => a - b);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export { hash };

/** How many people are waiting for a service right now. Deterministic, and drifts every 90 s. */
export function ambientWaiting(branchId: ID, serviceId: ID, now: EpochMs, closed = false): number {
  if (closed) return 0;
  const load = (SERVICE_LOAD[serviceId] ?? 2) * (factorByBranch.get(branchId) ?? 1);
  const bucket = Math.floor(now / 90_000);
  const wobble = (hash(`${branchId}|${serviceId}|${bucket}`) % 3) - 1;
  return Math.max(0, Math.round(load) + wobble);
}

/**
 * People waiting for a service. While staff have a counter open this is the real queue of the
 * service's group, otherwise the ambient simulation above.
 */
export function waitingFor(branch: Branch, serviceId: ID, now: EpochMs, closed = false): number {
  if (closed) return 0;
  const group = findService(serviceId)?.group;
  const real = group ? waitingInGroup(branch, group.id, now) : null;
  return real ?? ambientWaiting(branch.id, serviceId, now);
}

export function liveCatalogue(branch: Branch, now: EpochMs, closed: boolean): ServiceGroupLive[] {
  return GROUPS.map((g) => {
    const counters = Math.max(1, countersFor(branch, g.id).length);
    return {
      ...g,
      services: g.services.map((s) => {
        const waiting = waitingFor(branch, s.id, now, closed);
        return { ...s, waiting, usualWait: estimateWait(waiting, s.avgServiceMin, counters) };
      }),
    };
  });
}
