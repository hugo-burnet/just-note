import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ListingGenres } from '../../src/engine/index.ts';

const [A, B, C] = ['a', 'b', 'c'].map((name) => `https://x.test/${name}`) as [string, string, string];
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A reader the test answers for, series by series (an Error is a page that throws); what it was asked is kept. */
function reader(answers: Record<string, readonly string[] | null | Error>) {
  const asked: string[] = [];
  const read = async (url: string): Promise<readonly string[] | null> => {
    asked.push(url);
    const answer = answers[url];
    if (answer instanceof Error) throw answer;
    return answer ?? null;
  };
  return { asked, read, answers };
}

test('nothing is read until the reading is asked for', async () => {
  const { asked, read } = reader({});
  const genres = new ListingGenres([A, B], read);
  await tick();
  assert.equal(genres.started, false);
  assert.deepEqual(asked, []);
  assert.deepEqual([genres.answered, genres.total, genres.unread], [0, 2, 0]);
  assert.equal(genres.of(A), undefined);
});

test('every series is read once, and each answer is kept: genres, none at all, or the news that they could not be had', async () => {
  const { asked, read } = reader({ [A]: ['Action'], [B]: [], [C]: null });
  const genres = new ListingGenres([A, B, C], read);
  genres.start();
  assert.equal(genres.started, true);
  assert.equal(genres.reading, true);
  await tick();
  assert.equal(genres.reading, false);
  assert.deepEqual(asked, [A, B, C]);
  assert.deepEqual(genres.of(A), ['Action']);
  assert.deepEqual(genres.of(B), [], 'a page that says no genre is an answer');
  assert.equal(genres.of(C), undefined, 'a page that could not be read is not');
  assert.deepEqual([genres.answered, genres.total, genres.unread], [3, 3, 1]);
});

test('started again, only the series that could not be had are read, and what they give is learned', async () => {
  const { asked, read, answers } = reader({ [A]: ['Action'], [B]: null, [C]: new Error('timeout') });
  const genres = new ListingGenres([A, B, C], read);
  genres.start();
  await tick();
  assert.equal(genres.unread, 2);

  answers[B] = ['Drama'];
  genres.start();
  // They are being read again: no longer counted as lost, and the ones that were read stay answered.
  assert.deepEqual([genres.reading, genres.answered, genres.unread], [true, 1, 0]);
  await tick();
  assert.deepEqual(asked, [A, B, C, B, C], 'A, which was read, is not asked for again');
  assert.deepEqual(genres.of(B), ['Drama']);
  assert.deepEqual([genres.answered, genres.unread], [3, 1], 'C is still lost');
});

test('a series being read is not read a second time by a start in the meantime', async () => {
  const { asked, read } = reader({ [A]: ['Action'] });
  const genres = new ListingGenres([A], read);
  genres.start();
  genres.start();
  await tick();
  assert.deepEqual(asked, [A]);
});

test('it says when a reading began and when something was learned', async () => {
  const { read } = reader({ [A]: ['Action'], [B]: ['Drama'] });
  let told = 0;
  const genres = new ListingGenres([A, B], read, () => told++);
  genres.start();
  assert.equal(told, 1, 'the reading began');
  await tick();
  assert.equal(told, 3, 'and one answer after the other');
});
