import { createLocalStore } from "./local-store";

export interface LastBranch {
  id: string;
  bankSlug: string;
  branchSlug: string;
  name: string;
}

/** The branch this device used last. Lets "Get a token" skip the picker. Not personal data. */
export const lastBranch = createLocalStore<LastBranch | null>("qbit9.lastBranch", null);

export const branchHref = (b: { bankSlug: string; branchSlug: string } | null | undefined) =>
  b ? `/b/${b.bankSlug}/${b.branchSlug}` : "/branches";
