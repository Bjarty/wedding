import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatHouseholdCode,
  isPublicDemoHouseholdCode,
  isValidHouseholdCode,
  normalizeHouseholdCode,
  PUBLIC_DEMO_HOUSEHOLD_CODE,
} from './householdCode';

test('normaliseert alleen hoofdletters, spaties en koppeltekens', () => {
  assert.equal(
    normalizeHouseholdCode(' 7k3mp 9twx4-hcq2r dv6fn '),
    '7K3MP9TWX4HCQ2RDV6FN',
  );
  assert.equal(formatHouseholdCode('7k3mp9twx4hcq2rdv6fn'), PUBLIC_DEMO_HOUSEHOLD_CODE);
});

test('vereist twintig niet-ambiguë tekens', () => {
  assert.equal(isValidHouseholdCode(PUBLIC_DEMO_HOUSEHOLD_CODE), true);
  assert.equal(isValidHouseholdCode('7K3MP-9TWX4-HCQ2R'), false);
  assert.equal(isValidHouseholdCode('7K3MP-9TWX4-HCQ2R-DV6F0'), false);
  assert.equal(isValidHouseholdCode('7K3MP-9TWX4-HCQ2R-DV6FI'), false);
  assert.equal(isValidHouseholdCode('7K3MP-9TWX4-HCQ2R-DV6FU'), false);
});

test('de publieke voorbeeldcode herkent geen gedeeltelijke of andere code', () => {
  assert.equal(isPublicDemoHouseholdCode('7k3mp 9twx4 hcq2r dv6fn'), true);
  assert.equal(isPublicDemoHouseholdCode('7K3MP-9TWX4-HCQ2R-DV6FX'), false);
  assert.equal(isPublicDemoHouseholdCode('7K3MP-9TWX4-HCQ2R'), false);
});
