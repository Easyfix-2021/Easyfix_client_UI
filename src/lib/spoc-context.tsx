'use client';

/*
 * SPOC profile is fetched once by the (authed) layout and shared with
 * every page below via this context. Use `useSpoc()` inside any
 * authed page/component to read the current SPOC — the layout
 * guarantees it's non-null before rendering `children`, so callers
 * never need to handle a loading state.
 */
import { createContext, useContext } from 'react';

export type Spoc = {
  id: number;
  contact_name: string;
  client_id: number;
  email?: string;
};

export const SpocContext = createContext<Spoc | null>(null);

export function useSpoc(): Spoc {
  const spoc = useContext(SpocContext);
  if (!spoc) {
    throw new Error('useSpoc() must be used inside the (authed) layout');
  }
  return spoc;
}
