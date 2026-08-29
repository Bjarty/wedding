import { siteContent } from '../src/content/siteContent';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const errors: string[] = [];
const approvedPaymentOrigins = new Set<string>();

const requireText = (value: string, path: string) => {
  if (value.trim().length === 0) {
    errors.push(`${path} must not be empty`);
  }
};

const requireContentStrings = (value: unknown, path: string) => {
  if (typeof value === 'string') {
    requireText(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => requireContentStrings(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      requireContentStrings(child, `${path}.${key}`);
    }
  }
};

const requireItems = (items: unknown[], path: string) => {
  if (items.length === 0) {
    errors.push(`${path} must contain at least one item`);
  }
};

const requireUniqueIds = (items: Array<{ id: string }>, path: string) => {
  const ids = new Set<string>();

  for (const item of items) {
    if (ids.has(item.id)) {
      errors.push(`${path} contains duplicate id "${item.id}"`);
    }
    ids.add(item.id);
  }
};

const requireHttpUrl = (value: string, path: string) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${path} must use http or https`);
    }
  } catch {
    errors.push(`${path} must be a valid URL`);
  }
};

requireContentStrings(siteContent, 'siteContent');
requireItems(siteContent.navigation.items, 'navigation.items');
requireItems(siteContent.schedule.events, 'schedule.events');
requireItems(siteContent.dressCode.inspiration, 'dressCode.inspiration');
requireItems(siteContent.dressCode.colors, 'dressCode.colors');
requireItems(siteContent.location.travelOptions, 'location.travelOptions');
if (siteContent.story.enabled) {
  requireItems(siteContent.story.items, 'story.items');
}
if (siteContent.honeymoon.enabled) {
  requireItems(siteContent.honeymoon.stops, 'honeymoon.stops');
}
if (siteContent.gifts.enabled) {
  requireItems(siteContent.gifts.route, 'gifts.route');
  requireItems(siteContent.gifts.contributions, 'gifts.contributions');
}
requireUniqueIds(siteContent.navigation.items, 'navigation.items');
requireUniqueIds(siteContent.story.items, 'story.items');
requireUniqueIds(siteContent.schedule.events, 'schedule.events');
requireUniqueIds(siteContent.dressCode.inspiration, 'dressCode.inspiration');
requireUniqueIds(siteContent.dressCode.colors, 'dressCode.colors');
requireUniqueIds(siteContent.location.travelOptions, 'location.travelOptions');
requireUniqueIds(siteContent.honeymoon.stops, 'honeymoon.stops');
requireUniqueIds(siteContent.gifts.contributions, 'gifts.contributions');
requireUniqueIds(siteContent.footer.links, 'footer.links');

const sectionIds = [
  ...(siteContent.story.enabled ? [siteContent.story.sectionId] : []),
  siteContent.schedule.sectionId,
  siteContent.dressCode.sectionId,
  siteContent.location.sectionId,
  ...(siteContent.honeymoon.enabled ? [siteContent.honeymoon.sectionId] : []),
  ...(siteContent.gifts.enabled ? [siteContent.gifts.sectionId] : []),
  siteContent.rsvp.sectionId,
];
const sectionIdSet = new Set(sectionIds);

if (sectionIdSet.size !== sectionIds.length) {
  errors.push('section ids must be unique');
}

const navTargets = new Set<string>();
for (const item of siteContent.navigation.items) {
  const target = item.href.slice(1);
  navTargets.add(target);

  if (!sectionIdSet.has(target)) {
    errors.push(`navigation.items.${item.id}.href must target an existing section`);
  }
  if (item.id !== target) {
    errors.push(`navigation.items.${item.id}.id must match its anchor target`);
  }
}

for (const sectionId of sectionIds) {
  if (!navTargets.has(sectionId)) {
    errors.push(`navigation.items must include section "${sectionId}"`);
  }
}

if (siteContent.navigation.ctaHref !== `#${siteContent.rsvp.sectionId}`) {
  errors.push('navigation.ctaHref must target the RSVP section');
}

for (const item of siteContent.story.items) {
  requireHttpUrl(item.image, `story.items.${item.id}.image`);
}

requireHttpUrl(siteContent.location.mapHref, 'location.mapHref');

for (const stop of siteContent.honeymoon.stops) {
  requireHttpUrl(stop.image, `honeymoon.stops.${stop.id}.image`);
  if (!Number.isInteger(stop.day) || stop.day <= 0) {
    errors.push(`honeymoon.stops.${stop.id}.day must be a positive integer`);
  }
}

for (const contribution of siteContent.gifts.contributions) {
  if (siteContent.gifts.paymentLinksEnabled && !contribution.paymentHref) {
    errors.push(`gifts.contributions.${contribution.id}.paymentHref is required when payment links are enabled`);
  }
  if (siteContent.gifts.paymentLinksEnabled && !contribution.amountLabel) {
    errors.push(`gifts.contributions.${contribution.id}.amountLabel is required when payment links are enabled`);
  }
  if (siteContent.gifts.paymentLinksEnabled && !contribution.recipientLabel) {
    errors.push(`gifts.contributions.${contribution.id}.recipientLabel is required when payment links are enabled`);
  }
  if (!siteContent.gifts.paymentLinksEnabled && contribution.paymentHref) {
    errors.push(`gifts.contributions.${contribution.id}.paymentHref must be omitted while payment links are disabled`);
  }
  if (contribution.paymentHref) {
    try {
      const paymentUrl = new URL(contribution.paymentHref);
      if (paymentUrl.protocol !== 'https:') {
        errors.push(`gifts.contributions.${contribution.id}.paymentHref must use https`);
      }
      if (paymentUrl.username || paymentUrl.password) {
        errors.push(`gifts.contributions.${contribution.id}.paymentHref must not contain credentials`);
      }
      if (
        siteContent.gifts.paymentProvider &&
        paymentUrl.origin !== siteContent.gifts.paymentProvider.origin
      ) {
        errors.push(`gifts.contributions.${contribution.id}.paymentHref must use the configured provider origin`);
      }
      if (
        siteContent.gifts.paymentProvider &&
        !paymentUrl.pathname.startsWith(siteContent.gifts.paymentProvider.paymentPathPrefix)
      ) {
        errors.push(`gifts.contributions.${contribution.id}.paymentHref must use the configured provider path`);
      }
    } catch {
      errors.push(`gifts.contributions.${contribution.id}.paymentHref must be a valid URL`);
    }
  }
}

if (!siteContent.gifts.enabled && siteContent.gifts.paymentLinksEnabled) {
  errors.push('gifts.paymentLinksEnabled requires the gifts section to be enabled');
}

if (siteContent.gifts.paymentLinksEnabled && !siteContent.gifts.paymentProvider) {
  errors.push('gifts.paymentProvider is required when payment links are enabled');
}

if (siteContent.gifts.paymentProvider) {
  const { origin, paymentPathPrefix, privacyHref } = siteContent.gifts.paymentProvider;
  try {
    const providerOrigin = new URL(origin);
    if (
      providerOrigin.protocol !== 'https:' ||
      providerOrigin.username ||
      providerOrigin.password ||
      providerOrigin.port ||
      providerOrigin.pathname !== '/' ||
      providerOrigin.search ||
      providerOrigin.hash ||
      origin !== providerOrigin.origin
    ) {
      errors.push('gifts.paymentProvider.origin must be a canonical https origin');
    }
  } catch {
    errors.push('gifts.paymentProvider.origin must be a valid URL');
  }

  if (!approvedPaymentOrigins.has(origin)) {
    errors.push('gifts.paymentProvider.origin must be explicitly approved in content validation');
  }
  if (!paymentPathPrefix.startsWith('/') || paymentPathPrefix === '/') {
    errors.push('gifts.paymentProvider.paymentPathPrefix must be a non-root path prefix');
  }
  try {
    const privacyUrl = new URL(privacyHref);
    if (privacyUrl.protocol !== 'https:' || privacyUrl.username || privacyUrl.password) {
      errors.push('gifts.paymentProvider.privacyHref must be a credential-free https URL');
    }
  } catch {
    errors.push('gifts.paymentProvider.privacyHref must be a valid URL');
  }
}

let previousStartMinutes = -1;
for (const scheduleEvent of siteContent.schedule.events) {
  const timeMatch = scheduleEvent.time.match(/^([01]\d|2[0-3])\.([0-5]\d)(?: – ([01]\d|2[0-3]|00)\.([0-5]\d))?$/);
  if (!timeMatch) {
    errors.push(`schedule.events.${scheduleEvent.id}.time must use HH.MM or HH.MM – HH.MM`);
    continue;
  }

  const startMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  if (startMinutes < previousStartMinutes) {
    errors.push(`schedule.events.${scheduleEvent.id}.time must not start before the previous event`);
  }
  previousStartMinutes = startMinutes;
}

for (const [name, address] of Object.entries(siteContent.contacts)) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    errors.push(`contacts.${name} must contain a valid email address`);
  }
}

if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(siteContent.metadata.language)) {
  errors.push('metadata.language must be a valid language tag');
}

const requireIsoDate = (value: string, path: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path} must use YYYY-MM-DD format`);
    return;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.push(`${path} must be a real calendar date`);
  }
};

requireIsoDate(siteContent.event.date.iso, 'event.date.iso');
requireIsoDate(siteContent.event.rsvpDeadline.iso, 'event.rsvpDeadline.iso');

if (siteContent.event.rsvpDeadline.iso >= siteContent.event.date.iso) {
  errors.push('event.rsvpDeadline.iso must be before event.date.iso');
}

try {
  new Intl.DateTimeFormat('nl-NL', { timeZone: siteContent.event.timeZone });
} catch {
  errors.push('event.timeZone must be a valid IANA time zone');
}

for (const color of siteContent.dressCode.colors) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color.color)) {
    errors.push(`dressCode.colors.${color.id}.color must use six-digit hex format`);
  }
}

for (const item of siteContent.dressCode.inspiration) {
  if (!/^\/images\/dresscode\/[a-z0-9-]+\.webp$/.test(item.image)) {
    errors.push(`dressCode.inspiration.${item.id}.image must be a local dresscode WebP path`);
    continue;
  }

  const publicPath = resolve('public', item.image.slice(1));
  if (!existsSync(publicPath)) {
    errors.push(`dressCode.inspiration.${item.id}.image does not exist in public`);
  }
}

if (errors.length > 0) {
  console.error('Content validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('Content validation passed.');
}
