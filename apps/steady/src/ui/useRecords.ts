import { useCallback, useEffect, useState } from 'react';
import { listRecords, type HistoryRecord } from '../data/history';

export interface RecordsState {
  /** All valid records, or null while loading. */
  records: HistoryRecord[] | null;
  /** True when IndexedDB could not be read (R10.8). */
  unavailable: boolean;
  reload: () => void;
}

/** Loads saved results once and again on `reload()`. */
export function useRecords(): RecordsState {
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listRecords()
      .then((all) => {
        if (cancelled) return;
        setUnavailable(false);
        setRecords(all);
      })
      .catch(() => {
        if (cancelled) return;
        setUnavailable(true);
        setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { records, unavailable, reload };
}
