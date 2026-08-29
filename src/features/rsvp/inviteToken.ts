const inviteTokenPattern = /^[A-Za-z0-9_-]{32,128}$/u;

export const readInviteToken = (hash: string): string | null => {
  const match = /^#rsvp\/([^/?#]+)$/u.exec(hash);
  if (match === null || !inviteTokenPattern.test(match[1])) return null;
  return match[1];
};

export const isRsvpInviteFragment = (hash: string): boolean => hash.startsWith('#rsvp/');

export const shouldRemoveInviteFragment = (hash: string, rsvpEnabled: boolean): boolean =>
  rsvpEnabled && isRsvpInviteFragment(hash);

export const removeInviteFragment = (): void => {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
};
