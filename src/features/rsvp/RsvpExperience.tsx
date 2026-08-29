import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { siteContent } from '../../content/siteContent';
import { resolveHousehold, RsvpApiError, submitRsvp } from './api';
import type { RsvpConfig } from './config';
import { requestTurnstileToken } from './turnstile';
import type {
  DraftErrors,
  MealChoice,
  ResolvedHousehold,
  RsvpDraft,
  SubmitPayload,
} from './types';
import {
  createDraft,
  hasDraftErrors,
  normalizeOptionalText,
  toGuestSubmissions,
  validateDraft,
} from './validation';

type LoadState = 'loading' | 'ready' | 'invalid' | 'load-error' | 'offline' | 'rate-limited' | 'closed';
type NoticeKind = 'success' | 'validation' | 'submit-error' | 'offline' | 'rate-limited' | 'conflict';

interface Notice {
  kind: NoticeKind;
  message: string;
}

interface RsvpExperienceProps {
  config: RsvpConfig;
  inviteToken: string | null;
}

interface PendingSubmission {
  fingerprint: string;
  idempotencyKey: string;
}

const emptyErrors = (): DraftErrors => ({ guestAttendance: {}, guestMeal: {} });

const createIdempotencyKey = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const StatusPanel = ({
  message,
  retry,
  showContact = false,
  loading = false,
  retryDelaySeconds = 0,
}: {
  message: string;
  retry?: () => void;
  showContact?: boolean;
  loading?: boolean;
  retryDelaySeconds?: number;
}) => {
  const { contacts, rsvp } = siteContent;
  const Icon = loading ? LoaderCircle : AlertTriangle;
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-8 text-center shadow-2xl md:p-12"
    >
      <Icon
        aria-hidden="true"
        className={`mx-auto mb-6 h-12 w-12 text-gold ${loading ? 'motion-safe:animate-spin' : ''}`}
      />
      <p className="mx-auto max-w-lg text-base font-light leading-relaxed text-stone-dark/75" role={loading ? 'status' : 'alert'}>
        {message}
      </p>
      {retryDelaySeconds > 0 && (
        <p className="mt-3 text-sm font-semibold text-stone-dark/70">
          Je kunt het over {retryDelaySeconds} {retryDelaySeconds === 1 ? 'seconde' : 'seconden'} opnieuw proberen.
        </p>
      )}
      {retry !== undefined && (
        <button
          type="button"
          onClick={retry}
          disabled={retryDelaySeconds > 0}
          className="mt-8 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-cream transition-colors hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40 disabled:cursor-wait disabled:opacity-60"
        >
          {rsvp.states.retryLabel}
        </button>
      )}
      {showContact && (
        <a
          href={`mailto:${contacts.rsvpEmail}`}
          className="mt-8 inline-flex items-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-cream transition-colors hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
        >
          <Mail aria-hidden="true" className="h-4 w-4" />
          {rsvp.contactLabel}
        </a>
      )}
    </motion.div>
  );
};

const noticeStyles: Record<NoticeKind, string> = {
  success: 'border-emerald-700/30 bg-emerald-50 text-emerald-950',
  validation: 'border-red-700/30 bg-red-50 text-red-950',
  'submit-error': 'border-red-700/30 bg-red-50 text-red-950',
  offline: 'border-amber-700/30 bg-amber-50 text-amber-950',
  'rate-limited': 'border-amber-700/30 bg-amber-50 text-amber-950',
  conflict: 'border-amber-700/30 bg-amber-50 text-amber-950',
};

export default function RsvpExperience({ config, inviteToken }: RsvpExperienceProps) {
  const { contacts, rsvp } = siteContent;
  const prefersReducedMotion = useReducedMotion();
  const [loadState, setLoadState] = useState<LoadState>(inviteToken === null ? 'invalid' : 'loading');
  const [household, setHousehold] = useState<ResolvedHousehold | null>(null);
  const [draft, setDraft] = useState<RsvpDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>(emptyErrors);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'resolve' | 'submit' | null>(null);
  const [revision, setRevision] = useState(0);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [hasSavedRsvp, setHasSavedRsvp] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initialLoadStarted = useRef(false);
  const mounted = useRef(true);
  const runId = useRef(0);
  const operationInProgress = useRef(false);
  const pendingSubmission = useRef<PendingSubmission | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(() => setRetryAfterSeconds(0), retryAfterSeconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const applyResolvedHousehold = useCallback((resolved: ResolvedHousehold) => {
    setHousehold(resolved);
    setDraft(createDraft(resolved));
    setRevision(resolved.currentRsvp?.revision ?? 0);
    setReceiptNumber(resolved.currentRsvp?.receiptNumber ?? null);
    setHasSavedRsvp(resolved.currentRsvp !== null);
    setErrors(emptyErrors());
    setNotice(null);
    setRetryAfterSeconds(0);
    setLoadState('ready');
  }, []);

  const loadHousehold = useCallback(async () => {
    if (operationInProgress.current) return;
    if (inviteToken === null) {
      setLoadState('invalid');
      return;
    }
    const isResolvingConflict = notice?.kind === 'conflict';
    if (!navigator.onLine) {
      if (household === null) {
        setLoadState('offline');
      } else if (isResolvingConflict) {
        setNotice({ kind: 'conflict', message: `${rsvp.states.conflict} ${rsvp.states.offline}` });
      } else {
        setNotice({ kind: 'offline', message: rsvp.states.offline });
      }
      return;
    }

    const container = turnstileContainerRef.current;
    if (container === null) {
      if (household === null) {
        setLoadState('load-error');
      } else if (isResolvingConflict) {
        setNotice({ kind: 'conflict', message: `${rsvp.states.conflict} ${rsvp.states.loadError}` });
      } else {
        setNotice({ kind: 'submit-error', message: rsvp.states.loadError });
      }
      return;
    }

    operationInProgress.current = true;
    const currentRun = ++runId.current;
    setBusy('resolve');
    if (household === null) setLoadState('loading');

    try {
      const turnstileToken = await requestTurnstileToken(
        container,
        config.turnstileSiteKey,
        'rsvp_resolve',
      );
      const resolved = await resolveHousehold(config.apiBaseUrl, inviteToken, turnstileToken);
      if (!mounted.current || currentRun !== runId.current) return;
      applyResolvedHousehold(resolved);
      pendingSubmission.current = null;
    } catch (error) {
      if (!mounted.current || currentRun !== runId.current) return;
      const code = error instanceof RsvpApiError ? error.code : 'UPSTREAM_UNAVAILABLE';
      const retryDelay = error instanceof RsvpApiError ? (error.retryAfterSeconds ?? 60) : 60;

      if (code === 'INVITATION_INVALID') {
        setHousehold(null);
        setDraft(null);
        setLoadState('invalid');
      } else if (code === 'RSVP_CLOSED') {
        setHousehold(null);
        setDraft(null);
        setLoadState('closed');
      } else if (code === 'RATE_LIMITED') {
        setRetryAfterSeconds(Math.min(3_600, Math.max(1, retryDelay)));
        if (household === null) {
          setLoadState('rate-limited');
        } else if (isResolvingConflict) {
          setNotice({ kind: 'conflict', message: `${rsvp.states.conflict} ${rsvp.states.rateLimited}` });
        } else {
          setNotice({ kind: 'rate-limited', message: rsvp.states.rateLimited });
        }
      } else if (household === null) {
        setLoadState(navigator.onLine ? 'load-error' : 'offline');
      } else {
        setNotice({
          kind: isResolvingConflict ? 'conflict' : (navigator.onLine ? 'submit-error' : 'offline'),
          message: isResolvingConflict
            ? `${rsvp.states.conflict} ${navigator.onLine ? rsvp.states.loadError : rsvp.states.offline}`
            : (navigator.onLine ? rsvp.states.loadError : rsvp.states.offline),
        });
      }
    } finally {
      operationInProgress.current = false;
      if (mounted.current && currentRun === runId.current) setBusy(null);
    }
  }, [applyResolvedHousehold, config, household, inviteToken, notice?.kind, rsvp.states]);

  useEffect(() => {
    if (initialLoadStarted.current || inviteToken === null) return;
    initialLoadStarted.current = true;
    void loadHousehold();
  }, [inviteToken, loadHousehold]);

  const updateGuestAttendance = (guestId: string, attending: boolean) => {
    setDraft((current) => {
      if (current === null) return current;
      return {
        ...current,
        guests: current.guests.map((guest) =>
          guest.guestId === guestId
            ? { ...guest, attending, mealChoice: attending ? guest.mealChoice : null }
            : guest,
        ),
      };
    });
    setErrors((current) => ({
      ...current,
      guestAttendance: { ...current.guestAttendance, [guestId]: '' },
      guestMeal: attending ? current.guestMeal : { ...current.guestMeal, [guestId]: '' },
    }));
    if (notice?.kind === 'success' || notice?.kind === 'validation') setNotice(null);
  };

  const updateMealChoice = (guestId: string, mealChoice: MealChoice) => {
    setDraft((current) => {
      if (current === null) return current;
      return {
        ...current,
        guests: current.guests.map((guest) =>
          guest.guestId === guestId ? { ...guest, mealChoice } : guest,
        ),
      };
    });
    setErrors((current) => ({
      ...current,
      guestMeal: { ...current.guestMeal, [guestId]: '' },
    }));
    if (notice?.kind === 'success' || notice?.kind === 'validation') setNotice(null);
  };

  const focusFirstInvalidField = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      draft === null ||
      inviteToken === null ||
      busy !== null ||
      operationInProgress.current ||
      retryAfterSeconds > 0 ||
      notice?.kind === 'conflict'
    ) return;

    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (hasDraftErrors(nextErrors)) {
      setNotice({ kind: 'validation', message: rsvp.states.validationError });
      focusFirstInvalidField();
      return;
    }
    if (!navigator.onLine) {
      setNotice({ kind: 'offline', message: rsvp.states.offline });
      return;
    }

    const container = turnstileContainerRef.current;
    if (container === null) {
      setNotice({ kind: 'submit-error', message: rsvp.states.submitError });
      return;
    }

    const guests = toGuestSubmissions(draft);
    const email = normalizeOptionalText(draft.email);
    const message = normalizeOptionalText(draft.message);
    const submission = {
      revision,
      attending: guests.some((guest) => guest.attending),
      guests,
      ...(email === undefined ? {} : { email }),
      ...(message === undefined ? {} : { message }),
    };
    const fingerprint = JSON.stringify(submission);
    if (pendingSubmission.current?.fingerprint !== fingerprint) {
      pendingSubmission.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
    }

    operationInProgress.current = true;
    const currentRun = ++runId.current;
    setBusy('submit');
    setNotice(null);
    try {
      const turnstileToken = await requestTurnstileToken(
        container,
        config.turnstileSiteKey,
        'rsvp_submit',
      );
      const payload: SubmitPayload = {
        inviteToken,
        idempotencyKey: pendingSubmission.current.idempotencyKey,
        ...submission,
        turnstileToken,
      };
      const result = await submitRsvp(config.apiBaseUrl, payload);
      if (!mounted.current || currentRun !== runId.current) return;

      setRevision(result.revision);
      setReceiptNumber(result.receiptNumber);
      setHasSavedRsvp(true);
      setNotice({ kind: 'success', message: rsvp.states.success });
      setRetryAfterSeconds(0);
      pendingSubmission.current = null;
    } catch (error) {
      if (!mounted.current || currentRun !== runId.current) return;
      const code = error instanceof RsvpApiError ? error.code : 'UPSTREAM_UNAVAILABLE';
      const retryDelay = error instanceof RsvpApiError ? (error.retryAfterSeconds ?? 60) : 60;

      if (code === 'REVISION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT') {
        pendingSubmission.current = null;
        setNotice({ kind: 'conflict', message: rsvp.states.conflict });
      } else if (code === 'RATE_LIMITED') {
        setRetryAfterSeconds(Math.min(3_600, Math.max(1, retryDelay)));
        setNotice({ kind: 'rate-limited', message: rsvp.states.rateLimited });
      } else if (code === 'RSVP_CLOSED') {
        setLoadState('closed');
        setHousehold(null);
        setDraft(null);
      } else if (code === 'INVITATION_INVALID') {
        setLoadState('invalid');
        setHousehold(null);
        setDraft(null);
      } else if (code === 'VALIDATION_FAILED') {
        setNotice({ kind: 'validation', message: rsvp.states.validationError });
      } else {
        setNotice({
          kind: navigator.onLine ? 'submit-error' : 'offline',
          message: navigator.onLine ? rsvp.states.submitError : rsvp.states.offline,
        });
      }
    } finally {
      operationInProgress.current = false;
      if (mounted.current && currentRun === runId.current) setBusy(null);
    }
  };

  if (loadState === 'loading') {
    return (
      <>
        <StatusPanel message={rsvp.states.loading} loading />
        <div ref={turnstileContainerRef} className="mx-auto mt-4 min-h-16 max-w-sm" aria-label="Beveiligingscontrole" />
      </>
    );
  }
  if (loadState === 'invalid') return <StatusPanel message={rsvp.states.invalidLink} showContact />;
  if (loadState === 'closed') return <StatusPanel message={rsvp.states.closed} showContact />;
  if (loadState === 'offline') {
    return (
      <>
        <StatusPanel message={rsvp.states.offline} retry={() => void loadHousehold()} />
        <div ref={turnstileContainerRef} className="mx-auto mt-4 min-h-16 max-w-sm" aria-label="Beveiligingscontrole" />
      </>
    );
  }
  if (loadState === 'rate-limited') {
    return (
      <>
        <StatusPanel
          message={rsvp.states.rateLimited}
          retry={() => void loadHousehold()}
          retryDelaySeconds={retryAfterSeconds}
        />
        <div ref={turnstileContainerRef} className="mx-auto mt-4 min-h-16 max-w-sm" aria-label="Beveiligingscontrole" />
      </>
    );
  }
  if (loadState === 'load-error' || household === null || draft === null) {
    return (
      <>
        <StatusPanel message={rsvp.states.loadError} retry={() => void loadHousehold()} showContact />
        <div ref={turnstileContainerRef} className="mx-auto mt-4 min-h-16 max-w-sm" aria-label="Beveiligingscontrole" />
      </>
    );
  }

  const editingLocked = busy !== null || notice?.kind === 'conflict';

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-glass mx-auto max-w-3xl rounded-[2.5rem] p-6 text-stone-dark shadow-2xl sm:p-8 md:p-12"
    >
      <div className="text-center">
        <ShieldCheck aria-hidden="true" className="mx-auto mb-5 h-11 w-11 text-gold" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-dark/60">
          {rsvp.form.invitationHeading}
        </p>
        <h3 className="mt-3 text-3xl font-serif md:text-4xl">{household.displayName}</h3>
        <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Genodigden">
          {household.guests.map((guest) => (
            <li key={guest.guestId} className="rounded-full border border-gold/30 bg-white/50 px-4 py-2 text-sm">
              {guest.displayName}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-stone-dark/65">
          {rsvp.form.wrongNamesMessage}{' '}
          <a
            className="font-semibold underline decoration-gold underline-offset-4 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            href={`mailto:${contacts.rsvpEmail}`}
          >
            {contacts.rsvpEmail}
          </a>
        </p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="mt-10 space-y-8" noValidate>
        {notice !== null && (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm leading-relaxed ${noticeStyles[notice.kind]}`}
            role={notice.kind === 'success' ? 'status' : 'alert'}
            aria-live={notice.kind === 'success' ? 'polite' : 'assertive'}
          >
            <div className="flex items-start gap-3">
              {notice.kind === 'success' ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              <div>
                <p>{notice.message}</p>
                {(notice.kind === 'rate-limited' || notice.kind === 'conflict') && retryAfterSeconds > 0 && (
                  <p className="mt-2 font-semibold">
                    Je kunt het over {retryAfterSeconds}{' '}
                    {retryAfterSeconds === 1 ? 'seconde' : 'seconden'} opnieuw proberen.
                  </p>
                )}
                {notice.kind === 'conflict' && (
                  <button
                    type="button"
                    className="mt-3 font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    onClick={() => void loadHousehold()}
                    disabled={busy !== null || retryAfterSeconds > 0}
                  >
                    {rsvp.states.loadLatestLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {household.guests.map((guest, index) => {
            const answer = draft.guests.find((item) => item.guestId === guest.guestId);
            if (answer === undefined) return null;
            const attendanceError = errors.guestAttendance[guest.guestId];
            const mealError = errors.guestMeal[guest.guestId];
            const attendanceErrorId = `attendance-error-${index}`;
            const mealErrorId = `meal-error-${index}`;

            return (
              <div key={guest.guestId} className="rounded-3xl border border-gold/20 bg-white/45 p-5 sm:p-6">
                <fieldset>
                  <legend className="text-xl font-serif">
                    {rsvp.form.attendanceQuestionPrefix} {guest.displayName} erbij?
                  </legend>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { value: true, label: rsvp.form.attendanceYesLabel },
                      { value: false, label: rsvp.form.attendanceNoLabel },
                    ].map((option) => (
                      <label
                        key={String(option.value)}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-stone-dark/15 bg-white/70 px-4 py-3 transition-colors has-[:checked]:border-gold has-[:checked]:bg-gold/10 focus-within:ring-2 focus-within:ring-gold"
                      >
                        <input
                          type="radio"
                          name={`attendance-${guest.guestId}`}
                          value={String(option.value)}
                          checked={answer.attending === option.value}
                          onChange={() => updateGuestAttendance(guest.guestId, option.value)}
                          aria-invalid={attendanceError !== undefined && attendanceError !== ''}
                          aria-describedby={attendanceError ? attendanceErrorId : undefined}
                          disabled={editingLocked}
                          className="h-5 w-5 accent-gold"
                        />
                        <span className="text-sm font-semibold">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  {attendanceError && (
                    <p id={attendanceErrorId} className="mt-3 text-sm font-semibold text-red-800">
                      {attendanceError}
                    </p>
                  )}
                </fieldset>

                {answer.attending === true && (
                  <fieldset className="mt-6 border-t border-stone-dark/10 pt-6">
                    <legend className="px-1 text-base font-semibold">
                      {rsvp.form.mealQuestionPrefix} {guest.displayName}
                    </legend>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(Object.entries(rsvp.form.mealChoices) as Array<[MealChoice, string]>).map(
                        ([value, label]) => (
                          <label
                            key={value}
                            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-stone-dark/15 bg-white/70 px-3 py-3 transition-colors has-[:checked]:border-gold has-[:checked]:bg-gold/10 focus-within:ring-2 focus-within:ring-gold"
                          >
                            <input
                              type="radio"
                              name={`meal-${guest.guestId}`}
                              value={value}
                              checked={answer.mealChoice === value}
                              onChange={() => updateMealChoice(guest.guestId, value)}
                              aria-invalid={mealError !== undefined && mealError !== ''}
                              aria-describedby={mealError ? mealErrorId : undefined}
                              disabled={editingLocked}
                              className="h-5 w-5 shrink-0 accent-gold"
                            />
                            <span className="text-xs font-semibold sm:text-sm">{label}</span>
                          </label>
                        ),
                      )}
                    </div>
                    {mealError && (
                      <p id={mealErrorId} className="mt-3 text-sm font-semibold text-red-800">
                        {mealError}
                      </p>
                    )}
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label htmlFor="rsvp-email" className="block text-sm font-bold">
            {rsvp.form.emailLabel}
          </label>
          <input
            id="rsvp-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={draft.email}
            onChange={(event) => {
              setDraft((current) => current === null ? current : { ...current, email: event.target.value });
              setErrors((current) => ({ ...current, email: undefined }));
              if (notice?.kind === 'success' || notice?.kind === 'validation') setNotice(null);
            }}
            aria-invalid={errors.email !== undefined}
            aria-describedby={`rsvp-email-helper${errors.email === undefined ? '' : ' rsvp-email-error'}`}
            disabled={editingLocked}
            className="mt-3 w-full rounded-2xl border border-stone-dark/20 bg-white/70 px-4 py-3 text-base outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 disabled:opacity-60"
          />
          <p id="rsvp-email-helper" className="mt-2 text-sm leading-relaxed text-stone-dark/65">
            {rsvp.form.emailHelper} {rsvp.form.emailConfirmationNote}
          </p>
          {errors.email !== undefined && (
            <p id="rsvp-email-error" className="mt-2 text-sm font-semibold text-red-800">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="rsvp-message" className="block text-sm font-bold">
            {rsvp.form.messageLabel}
          </label>
          <textarea
            id="rsvp-message"
            rows={5}
            maxLength={1_000}
            value={draft.message}
            onChange={(event) => {
              setDraft((current) => current === null ? current : { ...current, message: event.target.value });
              setErrors((current) => ({ ...current, message: undefined }));
              if (notice?.kind === 'success' || notice?.kind === 'validation') setNotice(null);
            }}
            aria-invalid={errors.message !== undefined}
            aria-describedby={`rsvp-message-helper rsvp-message-count${errors.message === undefined ? '' : ' rsvp-message-error'}`}
            disabled={editingLocked}
            className="mt-3 w-full resize-y rounded-2xl border border-stone-dark/20 bg-white/70 px-4 py-3 text-base outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 disabled:opacity-60"
          />
          <div className="mt-2 flex flex-col gap-1 text-sm text-stone-dark/65 sm:flex-row sm:justify-between">
            <p id="rsvp-message-helper">{rsvp.form.messageHelper}</p>
            <p id="rsvp-message-count" className="shrink-0">
              {draft.message.length}/1000
            </p>
          </div>
          {errors.message !== undefined && (
            <p id="rsvp-message-error" className="mt-2 text-sm font-semibold text-red-800">
              {errors.message}
            </p>
          )}
        </div>

        <details className="rounded-2xl border border-stone-dark/15 bg-white/45 px-5 py-4">
          <summary className="cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            {rsvp.form.privacyHeading}
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-stone-dark/70">{rsvp.form.privacyMessage}</p>
        </details>

        {receiptNumber !== null && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-5 py-4 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-dark/60">
              {rsvp.states.receiptLabel}
            </p>
            <p className="mt-2 break-all font-mono text-lg font-bold" aria-live="polite">
              {receiptNumber}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-dark/65">{rsvp.states.receiptHelper}</p>
          </div>
        )}

        <div
          ref={turnstileContainerRef}
          className={`mx-auto flex max-w-sm justify-center ${busy === null ? 'min-h-0' : 'min-h-16'}`}
          aria-label="Beveiligingscontrole"
        />

        <button
          type="submit"
          disabled={editingLocked || retryAfterSeconds > 0}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.16em] text-cream transition-colors hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40 disabled:cursor-wait disabled:opacity-60 sm:tracking-[0.2em]"
        >
          {busy === 'submit' ? (
            <>
              <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
              {rsvp.states.submitting}
            </>
          ) : busy === 'resolve' ? (
            <>
              <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
              {rsvp.states.loading}
            </>
          ) : retryAfterSeconds > 0 ? (
            `Opnieuw proberen over ${retryAfterSeconds} sec.`
          ) : hasSavedRsvp ? (
            rsvp.form.updateLabel
          ) : (
            rsvp.form.submitLabel
          )}
        </button>
      </form>
    </motion.div>
  );
}
