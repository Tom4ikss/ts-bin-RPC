// Checks and refinements: formats, custom checks, checks on elements and objects, refinements of
// objects and of a union, and inputs without any.
import type { Check, Email, IsoDate, IsoDateTime, MaxLength, u32, Url, Uuid } from 'ts-bin-rpc';

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export type Slug = string & Check<'slug'>;

export interface Guest {
  email: Email;
  id: Uuid;
  site?: Url | null;
  tags: Slug[];
}

export type Event = { kind: 'meet'; range: DateRange } | { kind: 'call'; at: IsoDateTime };

export interface Invite {
  host: Guest;
  guests: Guest[] & MaxLength<3>;
  events: Event[];
  note: string & Check<'polite'> & Check<'short'>;
  seats: u32 & Check<'even'>;
}

export interface Directory {
  owners: Map<Email, Slug[]>;
  labels: Record<string, Slug & MaxLength<8>>;
  pair: [Email, u32 & Check<'even'>];
}

export const appRouter = {
  directory: async (input: Directory): Promise<u32> => input.owners.size as u32,
  invite: async (input: Invite): Promise<{ ok: boolean }> => ({ ok: input.guests.length > 0 }),
  slug: async (input: Slug): Promise<string> => input,
  ping: async (input: { n: u32 }): Promise<{ range: DateRange }> => ({ range: { start: '2026-01-01', end: '2026-01-0' + input.n } }),
};
