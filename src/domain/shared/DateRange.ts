export class DateRange {
  constructor(
    readonly start: string,
    readonly end: string
  ) {
    if (start > end) {
      throw new Error(`DateRange start ${start} must be <= end ${end}`);
    }
  }

  contains(date: string): boolean {
    return date >= this.start && date <= this.end;
  }

  static thisMonth(): DateRange {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = now.toISOString().split('T')[0];
    return new DateRange(start, end);
  }

  static today(): DateRange {
    const d = new Date().toISOString().split('T')[0];
    return new DateRange(d, d);
  }

  static lastDays(days: number): DateRange {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return new DateRange(start, end);
  }
}
