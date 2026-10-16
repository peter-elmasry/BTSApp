import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseInfo } from './release-info.mjs';

const sha = 'abcdef0' + '1'.repeat(33);
test('squash and merge commits produce the merged PR release automatically', () => {
  for (const message of [
    'feat: shipped (#36)',
    'Merge pull request #36 from owner/branch\n\nDetails',
  ]) {
    assert.deepEqual(releaseInfo({ sha, message, environment: 'production' }), {
      version: 'R36',
      commit: 'abcdef0',
      environment: 'production',
    });
  }
  assert.equal(releaseInfo({ sha, message: 'fix: next (#37)' }).version, 'R37');
});
test('preview uses its own PR and is never labeled as the previous production release', () => {
  assert.deepEqual(
    releaseInfo({ sha, message: 'previous (#35)', environment: 'preview', pullRequest: '36' }),
    {
      version: 'R36',
      commit: 'abcdef0',
      environment: 'preview',
    },
  );
  assert.equal(
    releaseInfo({ sha, message: 'merged (#36)', environment: 'production', pullRequest: '35' })
      .version,
    'R36',
  );
});
test('direct/rebase builds remain identifiable without inventing a release number', () => {
  assert.equal(releaseInfo({ sha, message: 'direct update' }).version, 'abcdef0');
  assert.equal(
    releaseInfo({ sha: '1234567' + sha.slice(7), message: 'direct update' }).version,
    '1234567',
  );
  assert.equal(
    releaseInfo({ sha, message: 'notes\nnot a merge (#99)', pullRequest: 'bad' }).version,
    'abcdef0',
  );
});
test('missing or malformed metadata cannot claim a release or expose arbitrary values', () => {
  assert.deepEqual(
    releaseInfo({ sha: 'not-a-sha', message: 'change (#36)', environment: 'secret-name' }),
    {
      version: '',
      commit: '',
      environment: 'development',
    },
  );
  assert.deepEqual(releaseInfo(), { version: '', commit: '', environment: 'development' });
});
