import { searchHouseholds } from './api';
import { requestTurnstileToken } from './turnstile';

export const NAME_SEARCH_DEBOUNCE_MILLISECONDS = 600;

export const normalizeNameQuery = (value: string): string => value.normalize('NFC').trim();

export const isValidNameQuery = (value: string): boolean => {
  const query = normalizeNameQuery(value);
  return query.length >= 2 && query.length <= 80 &&
    /^[\p{L}\p{M} '\u2019.\-]+$/u.test(query) &&
    (query.match(/\p{L}/gu)?.length ?? 0) >= 2;
};

export interface NameSearchServices {
  searchHouseholds: typeof searchHouseholds;
  requestTurnstileToken: typeof requestTurnstileToken;
}

export const liveNameSearchServices: NameSearchServices = {
  searchHouseholds,
  requestTurnstileToken,
};

/** Keeps canceled/out-of-order searches from replacing newer results. */
export class LatestNameSearch {
  private controller: AbortController | null = null;
  private generation = 0;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  begin(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.generation === generation && !controller.signal.aborted,
    };
  }
}
