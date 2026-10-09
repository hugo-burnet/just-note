/** Lets a few things run at once and keeps the others waiting, in the order they were asked. */
export class Limiter {
  private readonly max: number;
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running < this.max) this.running++;
    // A waiting task is handed the place of the one that ends, which is never given up in between.
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
