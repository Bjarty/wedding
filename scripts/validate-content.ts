import { siteContent } from '../src/content/siteContent';

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
requireItems(siteContent.story.items, 'story.items');
requireItems(siteContent.schedule.events, 'schedule.events');
requireItems(siteContent.location.travelOptions, 'location.travelOptions');
requireItems(siteContent.honeymoon.stops, 'honeymoon.stops');
requireItems(siteContent.footer.links, 'footer.links');
requireUniqueIds(siteContent.navigation.items, 'navigation.items');
requireUniqueIds(siteContent.story.items, 'story.items');
requireUniqueIds(siteContent.schedule.events, 'schedule.events');
requireUniqueIds(siteContent.location.travelOptions, 'location.travelOptions');
requireUniqueIds(siteContent.honeymoon.stops, 'honeymoon.stops');
requireUniqueIds(siteContent.footer.links, 'footer.links');

const sectionIds = [
  siteContent.story.sectionId,
  siteContent.schedule.sectionId,
  siteContent.location.sectionId,
  siteContent.honeymoon.sectionId,
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

requireHttpUrl(siteContent.location.image, 'location.image');

for (const stop of siteContent.honeymoon.stops) {
  requireHttpUrl(stop.image, `honeymoon.stops.${stop.id}.image`);
  if (!Number.isInteger(stop.day) || stop.day <= 0) {
    errors.push(`honeymoon.stops.${stop.id}.day must be a positive integer`);
  }
}

for (const event of siteContent.schedule.events) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) {
    errors.push(`schedule.events.${event.id}.time must use 24-hour HH:MM format`);
  }
}

if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(siteContent.footer.contactHref)) {
  errors.push('footer.contactHref must contain a valid mailto address');
}

if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(siteContent.metadata.language)) {
  errors.push('metadata.language must be a valid language tag');
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
