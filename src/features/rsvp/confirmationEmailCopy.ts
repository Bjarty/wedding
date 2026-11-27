import type { SiteContent } from '../../types';

type RsvpContent = SiteContent['rsvp'];

interface ConfirmationCopyOptions {
  confirmationEmailEnabled: boolean;
  demo: boolean;
  nameLookup?: boolean;
}

interface ReceiptCopyOptions extends ConfirmationCopyOptions {
  email: string;
}

const canPromiseConfirmationEmail = ({
  confirmationEmailEnabled,
  demo,
}: ConfirmationCopyOptions): boolean => confirmationEmailEnabled && !demo;

export const getEmailConfirmationNote = (
  rsvp: RsvpContent,
  options: ConfirmationCopyOptions,
): string => {
  if (options.demo) return rsvp.form.emailConfirmationDemoNote;
  if (options.nameLookup) {
    return canPromiseConfirmationEmail(options)
      ? rsvp.form.emailConfirmationNameEnabledNote
      : rsvp.form.emailConfirmationNameDisabledNote;
  }
  return canPromiseConfirmationEmail(options)
    ? rsvp.form.emailConfirmationEnabledNote
    : rsvp.form.emailConfirmationDisabledNote;
};

export const getPrivacyMessage = (
  rsvp: RsvpContent,
  options: ConfirmationCopyOptions,
): string => {
  if (options.demo) return rsvp.form.demoPrivacyMessage;
  const message = options.confirmationEmailEnabled
    ? rsvp.form.privacyMessage
    : rsvp.form.privacyEmailDisabledMessage;
  if (!options.nameLookup) return message;
  return `${message} ${rsvp.form.namePrivacyMessage}`;
};

export const getReceiptHelperText = (
  rsvp: RsvpContent,
  options: ReceiptCopyOptions,
): string => {
  if (options.demo) return rsvp.states.demoReceiptHelper;

  const emailMessage = options.confirmationEmailEnabled
    ? (options.email.trim() === ''
      ? rsvp.states.receiptEmailEmptyHelper
      : rsvp.states.receiptEmailEnabledHelper)
    : rsvp.states.receiptEmailDisabledHelper;

  return `${emailMessage} ${options.nameLookup ? rsvp.states.receiptNameAccessHelper : rsvp.states.receiptAccessHelper}`;
};
