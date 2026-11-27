import { LoaderCircle, Search, Users } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { siteContent } from '../content/siteContent';
import { RsvpApiError } from '../features/rsvp/api';
import type { RsvpConfig } from '../features/rsvp/config';
import {
  isValidNameQuery,
  LatestNameSearch,
  liveNameSearchServices,
  NAME_SEARCH_DEBOUNCE_MILLISECONDS,
  normalizeNameQuery,
  type NameSearchServices,
} from '../features/rsvp/nameSearch';
import type { NameSearchResult } from '../features/rsvp/types';

interface NameSearchEntryProps {
  config: RsvpConfig;
  onSelected: (nameTicket: string) => void;
  services?: NameSearchServices;
  demo?: boolean;
  disabled?: boolean;
}

export default function NameSearchEntry({
  config,
  onSelected,
  services = liveNameSearchServices,
  demo = false,
  disabled = false,
}: NameSearchEntryProps) {
  const { contacts, rsvp } = siteContent;
  const copy = rsvp.nameEntry;
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<NameSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const search = useRef(new LatestNameSearch());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const challengeContainer = useRef<HTMLDivElement>(null);

  const cancelSearch = useCallback(() => {
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = null;
    search.current.cancel();
  }, []);

  useEffect(() => () => cancelSearch(), [cancelSearch]);

  useEffect(() => {
    if (disabled) {
      cancelSearch();
      setBusy(false);
    }
  }, [cancelSearch, disabled]);

  useEffect(() => {
    if (retryUntil === 0) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0) setRetryUntil(0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

  const runSearch = useCallback(async (value: string) => {
    cancelSearch();
    if (disabled || retryUntil > Date.now() || composing.current) return;
    if (!isValidNameQuery(value)) {
      setError(copy.invalidQuery);
      setResult(null);
      setBusy(false);
      return;
    }
    if (challengeContainer.current === null) return;
    const request = search.current.begin();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const challenge = await services.requestTurnstileToken(
        challengeContainer.current,
        config.turnstileSiteKey,
        'rsvp_search',
        request.signal,
      );
      if (!request.isCurrent()) return;
      const found = await services.searchHouseholds(
        config.apiBaseUrl,
        normalizeNameQuery(value),
        challenge,
        request.signal,
      );
      if (request.isCurrent()) setResult(found);
    } catch (cause) {
      if (!request.isCurrent()) return;
      if (cause instanceof RsvpApiError && cause.code === 'RATE_LIMITED') {
        const delay = Math.max(1, Math.min(cause.retryAfterSeconds ?? 60, 300));
        setRetryUntil(Date.now() + delay * 1000);
        setRetrySeconds(delay);
        setError(rsvp.states.rateLimited);
      } else if (cause instanceof RsvpApiError && cause.code === 'RSVP_CLOSED') {
        setError(copy.closed);
      } else {
        setError(copy.error);
      }
    } finally {
      if (request.isCurrent()) setBusy(false);
    }
  }, [cancelSearch, config.apiBaseUrl, config.turnstileSiteKey, copy, disabled, retryUntil, rsvp.states.rateLimited, services]);

  const scheduleSearch = (value: string) => {
    cancelSearch();
    setBusy(false);
    setResult(null);
    if (retryUntil <= Date.now()) setError('');
    if (!disabled && isValidNameQuery(value) && !composing.current && retryUntil <= Date.now()) {
      debounce.current = setTimeout(() => void runSearch(value), NAME_SEARCH_DEBOUNCE_MILLISECONDS);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query);
  };

  return (
    <div className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-7 text-stone-dark shadow-2xl sm:p-10 md:p-12">
      <div className="text-center">
        <Users aria-hidden="true" className="mx-auto mb-5 h-11 w-11 text-olive" />
        <h3 className="text-3xl font-serif md:text-4xl">{copy.heading}</h3>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-stone-dark/80">{copy.introduction}</p>
      </div>
      <form className="mt-8" onSubmit={handleSubmit} noValidate role="search" aria-label="Zoek je RSVP-groep">
        <label htmlFor={inputId} className="block text-base font-bold">{copy.label}</label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            scheduleSearch(value);
          }}
          onCompositionStart={() => { composing.current = true; cancelSearch(); }}
          onCompositionEnd={(event) => { composing.current = false; scheduleSearch(event.currentTarget.value); }}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={80}
          disabled={disabled}
          enterKeyHint="search"
          placeholder={copy.placeholder}
          aria-describedby={`${helperId}${error ? ` ${errorId}` : ''}`}
          className="mt-3 min-h-14 w-full rounded-2xl border border-stone-dark/25 bg-white/80 px-4 py-4 text-lg outline-none placeholder:text-stone-dark/55 focus:border-jade focus:ring-2 focus:ring-jade"
        />
        <p id={helperId} className="mt-3 text-base leading-relaxed text-stone-dark/75">{copy.helper}</p>
        <button
          type="submit"
          disabled={disabled || busy || retrySeconds > 0}
          className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-base font-semibold text-cream transition-colors hover:bg-jade focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" /> : <Search aria-hidden="true" className="h-5 w-5" />}
          {copy.submitLabel}
        </button>
      </form>
      <div ref={challengeContainer} className={demo ? 'sr-only' : 'mt-4 min-h-16'} />
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 text-base leading-relaxed">
        {busy ? copy.searching : result?.tooMany ? copy.tooMany : result?.matches.length === 0 ? copy.noResults : result ? `${result.matches.length} ${result.matches.length === 1 ? 'groep gevonden' : 'groepen gevonden'}. ${copy.resultsHeading}.` : ''}
      </div>
      {error && <p id={errorId} role="alert" className="mt-4 text-base font-semibold text-red-900">{error}</p>}
      {retrySeconds > 0 && <p role="status" className="mt-2 text-base">Je kunt over {retrySeconds} seconden opnieuw zoeken.</p>}
      {result !== null && result.matches.length > 0 && (
        <ul className="mt-5 space-y-3" aria-label={copy.resultsHeading}>
          {result.matches.map((match) => (
            <li key={match.nameTicket}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => { cancelSearch(); setQuery(''); setResult(null); onSelected(match.nameTicket); }}
                className="min-h-16 w-full rounded-2xl border border-jade/45 bg-white/75 px-5 py-4 text-left text-lg font-semibold text-stone-dark transition-colors hover:bg-sage/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {match.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(error !== '' || result?.matches.length === 0) && (
        <a href={`mailto:${contacts.rsvpEmail}`} className="mt-5 inline-flex min-h-11 items-center text-base font-semibold text-jade underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade">
          {rsvp.contactLabel}
        </a>
      )}
      <p className="mt-6 text-sm leading-relaxed text-stone-dark/70">{copy.privacyNote}</p>
    </div>
  );
}
