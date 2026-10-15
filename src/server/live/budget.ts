// What one live query may spend: provider calls and wall-clock time. When either runs
// out, the engine stops asking and withholds what it can't prove (ARCHITECTURE.md).

export class BudgetExceededError extends Error {
  constructor(readonly reason: "calls" | "deadline") {
    super(reason === "calls" ? "This query's provider-call budget is used up." : "This query ran out of time.");
  }
}

export type BudgetLimits = { maxCalls: number; deadlineMs: number };

export class QueryBudget {
  private used = 0;
  private readonly endsAt: number;

  constructor(
    readonly limits: BudgetLimits,
    private readonly clock: () => number = Date.now,
  ) {
    this.endsAt = clock() + limits.deadlineMs;
  }

  /** Reserve one provider call; throws when the call or time budget is gone. */
  spendCall(): void {
    if (this.clock() >= this.endsAt) throw new BudgetExceededError("deadline");
    if (this.used >= this.limits.maxCalls) throw new BudgetExceededError("calls");
    this.used++;
  }

  /** Milliseconds left, for a provider call's own timeout. */
  remainingMs(): number {
    return Math.max(0, this.endsAt - this.clock());
  }

  get callsUsed(): number {
    return this.used;
  }
}
