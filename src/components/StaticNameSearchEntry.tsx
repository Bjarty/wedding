import { Search, Users } from 'lucide-react';
import { type FormEvent, useId, useMemo, useRef, useState } from 'react';
import { siteContent } from '../content/siteContent';
import { isValidNameQuery } from '../features/rsvp/nameSearch';
import { publicRsvpRoster, searchStaticRoster, type StaticRosterGroup } from '../features/rsvp/staticRoster';

interface StaticNameSearchEntryProps {
  onSelected: (householdId: string) => void;
  groups?: readonly StaticRosterGroup[];
}

export default function StaticNameSearchEntry({ onSelected, groups = publicRsvpRoster.groups }: StaticNameSearchEntryProps) {
  const { contacts, rsvp } = siteContent;
  const copy = rsvp.nameEntry;
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const resultsId = `${inputId}-results`;
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const validQuery = isValidNameQuery(query);
  const result = useMemo(() => searchStaticRoster(query, groups), [groups, query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!validQuery) inputRef.current?.focus();
    else if (result.matches.length > 0) resultsHeadingRef.current?.focus();
  };

  const message = !validQuery
    ? (submitted ? copy.invalidQuery : '')
    : result.tooMany ? copy.tooMany
      : result.matches.length === 0 ? copy.noResults
        : `${result.matches.length} ${result.matches.length === 1 ? 'groep gevonden' : 'groepen gevonden'}. ${copy.resultsHeading}.`;

  return (
    <div className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-7 text-stone-dark shadow-2xl sm:p-10 md:p-12">
      <div className="text-center">
        <Users aria-hidden="true" className="mx-auto mb-5 h-11 w-11 text-olive" />
        <h3 className="text-3xl font-serif md:text-4xl">{copy.heading}</h3>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-stone-dark/80">{copy.introduction}</p>
      </div>
      <form role="search" aria-label="Zoek je RSVP-groep" className="mt-8" onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="block text-base font-bold">{copy.label}</label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSubmitted(false); }}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={80}
          enterKeyHint="search"
          placeholder={copy.placeholder}
          aria-describedby={helperId}
          aria-controls={resultsId}
          aria-invalid={submitted && !validQuery}
          className="mt-3 min-h-14 w-full rounded-2xl border border-stone-dark/25 bg-white/80 px-4 py-4 text-lg outline-none placeholder:text-stone-dark/55 focus:border-jade focus:ring-2 focus:ring-jade"
        />
        <p id={helperId} className="mt-3 text-base leading-relaxed text-stone-dark/75">{copy.helper}</p>
        <button type="submit" className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-base font-semibold text-cream transition-colors hover:bg-jade focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          <Search aria-hidden="true" className="h-5 w-5" />{copy.submitLabel}
        </button>
      </form>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-5 text-base leading-relaxed">{message}</div>
      <div id={resultsId}>
        {validQuery && result.matches.length > 0 && (
          <>
            <h4 ref={resultsHeadingRef} tabIndex={-1} className="mt-5 text-lg font-semibold outline-none">{copy.resultsHeading}</h4>
            <ul className="mt-3 space-y-3" aria-label={copy.resultsHeading}>
              {result.matches.map((match) => (
                <li key={match.householdId}>
                  <button
                    type="button"
                    onClick={() => { setQuery(''); onSelected(match.householdId); }}
                    className="min-h-16 w-full rounded-2xl border border-jade/45 bg-white/75 px-5 py-4 text-left text-lg font-semibold text-stone-dark transition-colors hover:bg-sage/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {match.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {validQuery && result.matches.length === 0 && !result.tooMany && (
        <a href={`mailto:${contacts.rsvpEmail}`} className="mt-5 inline-flex min-h-11 items-center text-base font-semibold text-jade underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade">{rsvp.contactLabel}</a>
      )}
      <p className="mt-6 text-sm leading-relaxed text-stone-dark/70">{copy.privacyNote}</p>
    </div>
  );
}
