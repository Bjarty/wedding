const householdCodePattern = /^(?:[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}|[23456789ABCDEFGHJKMNPQRSTVWXYZ]{20})$/u;
const currentHouseholdCodeLength = 6;
const legacyHouseholdCodeLength = 20;

/**
 * Public, synthetic code for the local invitation preview. It is never
 * provisioned in a Worker or Sheet and therefore is not an invitation secret.
 */
export const PUBLIC_DEMO_HOUSEHOLD_CODE = '7K3-MP9';
export const LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE = '7K3MP-9TWX4-HCQ2R-DV6FN';

export const normalizeHouseholdCode = (value: string): string =>
  value
    .normalize('NFC')
    .toUpperCase()
    .replace(/[\u0009-\u000D\u0020-]/gu, '');

export const formatHouseholdCode = (value: string): string => {
  const normalized = normalizeHouseholdCode(value).slice(0, legacyHouseholdCodeLength);
  const groupSize = normalized.length <= currentHouseholdCodeLength ? 3 : 5;
  return normalized.match(new RegExp(`.{1,${groupSize}}`, 'gu'))?.join('-') ?? '';
};

export const isValidHouseholdCode = (value: string): boolean =>
  householdCodePattern.test(normalizeHouseholdCode(value));

export const isPublicDemoHouseholdCode = (value: string): boolean =>
  isValidHouseholdCode(value) &&
  [PUBLIC_DEMO_HOUSEHOLD_CODE, LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE]
    .some((code) => normalizeHouseholdCode(value) === normalizeHouseholdCode(code));
