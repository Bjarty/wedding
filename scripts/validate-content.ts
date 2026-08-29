import { siteContent } from '../src/content/siteContent';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const errors: string[] = [];

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
requireUniqueIds(siteContent.navigation.items, 'navigation.items');
requireUniqueIds(siteContent.story.items, 'story.items');
requireUniqueIds(siteContent.schedule.events, 'schedule.events');
requireUniqueIds(siteContent.dressCode.inspiration, 'dressCode.inspiration');
requireUniqueIds(siteContent.dressCode.colors, 'dressCode.colors');
requireUniqueIds(siteContent.location.travelOptions, 'location.travelOptions');
requireUniqueIds(siteContent.honeymoon.stops, 'honeymoon.stops');
requireUniqueIds(siteContent.footer.links, 'footer.links');

const sectionIds = [
  ...(siteContent.story.enabled ? [siteContent.story.sectionId] : []),
  siteContent.schedule.sectionId,
  siteContent.dressCode.sectionId,
  siteContent.location.sectionId,
  ...(siteContent.honeymoon.enabled ? [siteContent.honeymoon.sectionId] : []),
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
