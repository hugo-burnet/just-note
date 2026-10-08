/** One way of answering a request with the help of a cache. */
export interface Strategy {
  handle(request: Request): Promise<Response>;
}

// A cached answer is good whoever asked: the proxy varies its CORS headers by the
// requesting origin, which has no bearing on the page or the image itself.
export const MATCH = { ignoreVary: true } as const;
