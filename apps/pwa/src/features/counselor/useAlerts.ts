import { Alert } from '@vigil/shared-types';
import { z } from 'zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ensureOk } from '../../api/client';

const POLL_MS = 20_000;

/**
 * Runtime-validate alerts with the shared Zod schema. Besides guarding the
 * wire format, this enforces the dignity rule client-side: an alert carrying
 * a numeric raw_score is rejected, never displayed. (Also works around
 * openapi-fetch's Readable<> helper, which drops null-only properties such
 * as raw_score from response types.)
 */
export const parseAlerts = (input: unknown): Alert[] => z.array(Alert).parse(input);
/** Last-seen alerts, so the detail view can open instantly (always refreshed from the network). */
export const alertCache = new Map<string, Alert>();

/**
 * Open alerts, severity-sorted by the server. Network-only by design (the
 * service worker never caches /v1): if we can't reach the server we say so
 * rather than show stale alerts as current.
 */
export function useOpenAlerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const hidden = useRef(new Set<string>()); // optimistically acknowledged

  const refresh = useCallback(async () => {
    try {
      const data = ensureOk(await api.GET('/v1/alerts', { params: { query: { status: 'open' } } }));
      const alerts = parseAlerts(data.alerts);
      alerts.forEach((a) => alertCache.set(a.id, a));
      setAlerts(alerts.filter((a) => !hidden.current.has(a.id)));
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reach the server');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);

  const acknowledge = useCallback(async (id: string) => {
    hidden.current.add(id);
    setAlerts((cur) => cur?.filter((a) => a.id !== id) ?? cur);
    try {
      const { alert } = ensureOk(await api.POST('/v1/alerts/{id}/acknowledge', { params: { path: { id } } }));
      const parsed = Alert.parse(alert);
      alertCache.set(parsed.id, parsed);
    } catch (e) {
      hidden.current.delete(id);
      setError(`Couldn't acknowledge — ${e instanceof Error ? e.message : 'try again'}`);
      void refresh();
    }
  }, [refresh]);

  return { alerts, error, fetchedAt, refresh, acknowledge };
}
