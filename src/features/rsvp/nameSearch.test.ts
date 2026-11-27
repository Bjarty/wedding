import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidNameQuery, LatestNameSearch, normalizeNameQuery, NAME_SEARCH_DEBOUNCE_MILLISECONDS } from './nameSearch';

test('naamzoeker accepteert Unicode-namen en weigert te korte of ongeldige invoer', () => {
  for (const value of ['Jo', ' Éloïse ', 'O’Neil', "O'Neil", 'van der Voorbeeld', 'Test-Naam', 'A. B.', 'E\u0301loïse']) {
    assert.equal(isValidNameQuery(value), true);
  }
  for (const value of ['', 'A', 'A.', '  ', '--', '12', 'Alex123', 'Alex\nSam', '<script>', 'A'.repeat(81)]) {
    assert.equal(isValidNameQuery(value), false);
  }
  assert.equal(normalizeNameQuery(' E\u0301loïse '), 'Éloïse');
  assert.equal(NAME_SEARCH_DEBOUNCE_MILLISECONDS, 600);
});

test('verouderde of afgebroken zoekopdrachten kunnen de laatste resultaten niet vervangen', () => {
  const latest = new LatestNameSearch();
  const first = latest.begin();
  assert.equal(first.isCurrent(), true);
  const second = latest.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  latest.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});
