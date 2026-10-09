import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Limiter } from '../../src/engine/Limiter.ts';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test('limiter: only so many things run at once, and the others follow in the order they were asked', async () => {
  const limiter = new Limiter(2);
  const started: number[] = [];
  const open: Array<() => void> = [];
  const job = (n: number) =>
    limiter.run(
      () =>
        new Promise<number>((resolve) => {
          started.push(n);
          open.push(() => resolve(n));
        }),
    );
  const all = [1, 2, 3, 4].map(job);
  await tick();
  assert.deepEqual(started, [1, 2]);
  open[0]?.();
  await tick();
  assert.deepEqual(started, [1, 2, 3]);
  open[1]?.();
  open[2]?.();
  await tick();
  assert.deepEqual(started, [1, 2, 3, 4]);
  open[3]?.();
  assert.deepEqual(await Promise.all(all), [1, 2, 3, 4]);
});

test('limiter: a task that fails gives its place to the next, and says why to whoever asked', async () => {
  const limiter = new Limiter(1);
  const failed = limiter.run(async () => {
    throw new Error('boom');
  });
  const next = limiter.run(async () => 'went on');
  await assert.rejects(() => failed, { message: 'boom' });
  assert.equal(await next, 'went on');
});
