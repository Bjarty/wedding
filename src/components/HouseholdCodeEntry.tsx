import { KeyRound, ShieldCheck } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { siteContent } from '../content/siteContent';
import {
  formatHouseholdCode,
  isValidHouseholdCode,
  normalizeHouseholdCode,
} from '../features/rsvp/householdCode';

interface HouseholdCodeEntryProps {
  onAccepted: (normalizedCode: string) => void;
}

export default function HouseholdCodeEntry({ onAccepted }: HouseholdCodeEntryProps) {
  const { codeEntry } = siteContent.rsvp;
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const [value, setValue] = useState('');
  const [hasError, setHasError] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidHouseholdCode(value)) {
      setHasError(true);
      return;
    }
    setHasError(false);
    onAccepted(normalizeHouseholdCode(value));
  };

  return (
    <div className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-7 text-stone-dark shadow-2xl sm:p-10 md:p-12">
      <div className="text-center">
        <KeyRound aria-hidden="true" className="mx-auto mb-5 h-11 w-11 text-[#8A5A03]" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-dark/60">
          {codeEntry.eyebrow}
        </p>
        <h3 className="mt-3 text-3xl font-serif md:text-4xl">{codeEntry.heading}</h3>
        <p className="mx-auto mt-4 max-w-lg text-sm font-light leading-relaxed text-stone-dark/70 sm:text-base">
          {codeEntry.introduction}
        </p>
      </div>

      <form className="mt-8" onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="block text-sm font-bold">
          {codeEntry.label}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(formatHouseholdCode(event.target.value));
            if (hasError) setHasError(false);
          }}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={23}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          aria-invalid={hasError}
          aria-describedby={`${helperId}${hasError ? ` ${errorId}` : ''}`}
          className="mt-3 w-full rounded-2xl border border-stone-dark/20 bg-white/75 px-4 py-4 text-center font-mono text-base font-bold uppercase tracking-[0.14em] outline-none transition placeholder:text-stone-dark/30 focus:border-[#8A5A03] focus:ring-4 focus:ring-gold/20 sm:text-lg sm:tracking-[0.2em]"
        />
        <p id={helperId} className="mt-3 text-sm leading-relaxed text-stone-dark/65">
          {codeEntry.helper}
        </p>
        {hasError && (
          <p id={errorId} role="alert" className="mt-3 text-sm font-semibold text-red-800">
            {codeEntry.invalidFormat}
          </p>
        )}
        <button
          type="submit"
          className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.18em] text-cream transition-colors hover:bg-[#8A5A03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
        >
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          {codeEntry.submitLabel}
        </button>
      </form>
    </div>
  );
}
