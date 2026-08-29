export type TurnstileAction = 'rsvp_resolve' | 'rsvp_submit';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: TurnstileAction;
      execution: 'execute';
      appearance: 'interaction-only';
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
      'timeout-callback': () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

type WindowWithTurnstile = Window & { turnstile?: TurnstileApi };

const scriptId = 'cloudflare-turnstile-script';
let scriptPromise: Promise<TurnstileApi> | null = null;

const loadTurnstile = (): Promise<TurnstileApi> => {
  const existing = (window as WindowWithTurnstile).turnstile;
  if (existing !== undefined) return Promise.resolve(existing);
  if (scriptPromise !== null) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    let script: HTMLScriptElement;

    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      script.removeEventListener('load', onReady);
      script.removeEventListener('error', onError);
    };
    const onReady = () => {
      if (settled) return;
      const api = (window as WindowWithTurnstile).turnstile;
      if (api === undefined) {
        onError();
        return;
      }
      settled = true;
      cleanup();
      resolve(api);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      scriptPromise = null;
      reject(new Error('Turnstile kon niet worden geladen.'));
    };

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript !== null) {
      script = existingScript;
    } else {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
    }
    script.addEventListener('load', onReady, { once: true });
    script.addEventListener('error', onError, { once: true });
    timeoutId = window.setTimeout(onError, 15_000);
    if (existingScript === null) document.head.append(script);
  });

  return scriptPromise;
};

export const requestTurnstileToken = async (
  container: HTMLElement,
  siteKey: string,
  action: TurnstileAction,
  signal?: AbortSignal,
): Promise<string> => {
  const turnstile = await loadTurnstile();

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | null = null;
    let settled = false;
    let removeWhenReady = false;
    const timeout = window.setTimeout(() => finish(new Error('De beveiligingscontrole duurde te lang.')), 90_000);

    const removeWidget = () => {
      if (widgetId === null) {
        removeWhenReady = true;
      } else {
        turnstile.remove(widgetId);
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      removeWidget();
    };

    const finish = (error: Error | null, token?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error !== null || token === undefined || token === '') {
        reject(error ?? new Error('De beveiligingscontrole is niet geslaagd.'));
      } else {
        resolve(token);
      }
    };

    const onAbort = () => finish(new DOMException('Afgebroken', 'AbortError'));
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token) => finish(null, token),
        'error-callback': () => finish(new Error('De beveiligingscontrole is niet geslaagd.')),
        'expired-callback': () => finish(new Error('De beveiligingscontrole is verlopen.')),
        'timeout-callback': () => finish(new Error('De beveiligingscontrole duurde te lang.')),
      });
      if (removeWhenReady) turnstile.remove(widgetId);
      if (!settled) turnstile.execute(widgetId);
    } catch {
      finish(new Error('De beveiligingscontrole kon niet starten.'));
    }
  });
};
