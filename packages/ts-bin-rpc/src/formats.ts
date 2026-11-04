// Implementations of the format checks: `Email`, `Uuid`, `Url`, `IsoDate`, `IsoDateTime`.
//   createHandler(appRouter, { procedures, checks: formats })
// or pick some and add your own: `checks: { email: formats.email, slug: (v) => … }`.
// A module of its own, so that a server without formats does not carry them.

// The rule of `<input type="email">` in the HTML standard: no quoted local parts, no IP domains, no
// internationalized domains; a domain without a dot passes.
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

function calendar(y: string, m: string, d: string): boolean {
  const month = Number(m), day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
}

export const formats = {
  /** As `<input type="email">` accepts: `name@domain`, at most 254 characters. */
  email: (v: string): boolean => v.length <= 254 && EMAIL.test(v),
  /** 8-4-4-4-12 hex digits, any version and variant, either case. */
  uuid: (v: string): boolean => UUID.test(v),
  /** An absolute URL that `new URL()` accepts, any scheme. */
  url: (v: string): boolean => URL.canParse(v),
  /** `YYYY-MM-DD`, a date that exists: no `2026-02-30`. */
  isoDate: (v: string): boolean => {
    const m = DATE.exec(v);
    return m !== null && calendar(m[1], m[2], m[3]);
  },
  /** RFC 3339: `YYYY-MM-DDTHH:MM:SS`, optional fraction, then `Z` or an offset. Leap second 60 passes. */
  isoDateTime: (v: string): boolean => {
    const m = DATE_TIME.exec(v);
    if (m === null || !calendar(m[1], m[2], m[3])) return false;
    if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 60) return false;
    return m[7] === undefined || (Number(m[8]) <= 23 && Number(m[9]) <= 59);
  },
};
