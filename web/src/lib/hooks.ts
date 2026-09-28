import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { supabase } from './supabase';
import type { Health } from './types';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading };
}

type Watch = { table: string; filter?: string };

/**
 * Fetch data and keep it fresh with Supabase Realtime: any insert/update/delete on the
 * watched tables triggers a debounced refetch. RLS guarantees we only hear about our rows.
 */
export function useLiveQuery<T>(key: string, fetcher: () => Promise<T>, watch: Watch[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const watchKey = JSON.stringify(watch);
  useEffect(() => {
    setLoading(true);
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const w of JSON.parse(watchKey) as Watch[]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: w.filter }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 250);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [key, watchKey, refresh]);

  return { data, error, loading, refresh };
}

let healthCache: Promise<Health> | null = null;

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    healthCache ??= api.health();
    healthCache.then(setHealth).catch(() => {
      healthCache = null;
    });
  }, []);
  return health;
}
