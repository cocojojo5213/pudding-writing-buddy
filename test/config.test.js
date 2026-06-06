import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntegerSetting } from '../server-config.js';

test('integer server settings fall back when env values are invalid', () => {
  const options = { defaultValue: 5179, min: 1, max: 65535 };

  assert.equal(parseIntegerSetting(undefined, options), 5179);
  assert.equal(parseIntegerSetting('', options), 5179);
  assert.equal(parseIntegerSetting('abc', options), 5179);
  assert.equal(parseIntegerSetting('12.5', options), 5179);
  assert.equal(parseIntegerSetting('0', options), 5179);
  assert.equal(parseIntegerSetting('65536', options), 5179);
  assert.equal(parseIntegerSetting(' 5180 ', options), 5180);
});

test('stale temp cleanup setting requires a positive whole millisecond value', () => {
  const options = { defaultValue: 86_400_000, min: 1000 };

  assert.equal(parseIntegerSetting('not-a-number', options), 86_400_000);
  assert.equal(parseIntegerSetting('0', options), 86_400_000);
  assert.equal(parseIntegerSetting('-1', options), 86_400_000);
  assert.equal(parseIntegerSetting('999', options), 86_400_000);
  assert.equal(parseIntegerSetting('1000', options), 1000);
});
