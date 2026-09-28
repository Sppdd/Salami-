import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Business } from './types';

type Ctx = { business: Business | null; reload: () => Promise<void> };
const BusinessContext = createContext<Ctx>({ business: null, reload: async () => {} });

/** Self-serve onboarding: the first sign-in creates a business with sensible defaults. */
export function BusinessProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);

  const reload = useCallback(async () => {
    const existing = await supabase.from('businesses').select('*').eq('owner_id', userId).maybeSingle();
    if (existing.data) {
      setBusiness(existing.data as Business);
      return;
    }
    const created = await supabase
      .from('businesses')
      .upsert(
        { owner_id: userId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' },
        { onConflict: 'owner_id' },
      )
      .select('*')
      .single();
    if (created.data) setBusiness(created.data as Business);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <BusinessContext.Provider value={{ business, reload }}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => useContext(BusinessContext);
