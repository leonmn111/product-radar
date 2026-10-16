/** Thrown by engine scaffolds until they are built (ROADMAP Phase 0), so a stub never returns a made-up value. */
export class NotImplementedError extends Error {
  constructor(readonly fn: string) {
    super(`${fn} is not implemented yet (ROADMAP.md, Phase 0).`);
    this.name = "NotImplementedError";
  }
}

export function notImplemented(fn: string): never {
  throw new NotImplementedError(fn);
}
