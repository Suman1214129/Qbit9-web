
export function formatTokenCode(prefix: string, number: number): string {
  return `${prefix.toUpperCase()}-${String(number).padStart(3, "0")}`;
}

export function parseTokenCode(code: string): { prefix: string; number: number } | null {
  const m = /^([A-Za-z])-(\d{1,4})$/.exec(code.trim());
  if (!m) return null;
  return { prefix: (m[1] ?? "").toUpperCase(), number: Number(m[2]) };
}

/** "1st", "2nd", "3rd", "8th", "11th", "22nd". */
export function ordinal(n: number): string {
  const v = Math.abs(n) % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

