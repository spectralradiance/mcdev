// View settings live in the query string, so a link reproduces the algorithm and input being shown.

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useParam<T extends string | number = string>(key: string, fallback: NoInfer<T>, parse?: (raw: string) => T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  let value = fallback;
  if (raw !== null) {
    const parsed = parse ? parse(raw) : (raw as T);
    if (!(typeof parsed === 'number' && Number.isNaN(parsed))) value = parsed;
  }
  const set = useCallback((v: T) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === fallback) next.delete(key); else next.set(key, String(v));
      return next;
    }, { replace: true });
  }, [key, fallback, setParams]);
  return [value, set];
}
