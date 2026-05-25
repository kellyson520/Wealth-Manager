import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';

export class AchievementUnlockedEvent extends DomainEvent {
  readonly eventType = 'AchievementUnlocked';
  constructor(readonly aggregateId: string, readonly name: string) { super(); }
}

export class Achievement extends AggregateRoot {
  private _unlocked: boolean;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    readonly maxProgress: number,
    private _progress: number = 0,
    unlocked: boolean = false,
    readonly unlockedAt?: string,
  ) {
    super();
    this._unlocked = unlocked;
  }

  addProgress(delta: number): void {
    if (this._unlocked) return;
    this._progress = Math.min(this._progress + delta, this.maxProgress);
    if (this._progress >= this.maxProgress) {
      this._unlocked = true;
      this.addEvent(new AchievementUnlockedEvent(this.id, this.name));
    }
  }

  get progress(): number { return this._progress; }
  get isUnlocked(): boolean { return this._unlocked; }
  get percent(): number { return Math.round((this._progress / this.maxProgress) * 100); }
}

export class Streak extends AggregateRoot {
  private _currentStreak: number = 0;
  private _longestStreak: number = 0;
  private _lastRecordDate: string | null = null;

  recordDay(date: string): void {
    if (!this._lastRecordDate) {
      this._currentStreak = 1;
    } else if (this.isConsecutive(this._lastRecordDate, date)) {
      this._currentStreak++;
    } else if (date !== this._lastRecordDate) {
      this._currentStreak = 1;
    }
    this._longestStreak = Math.max(this._longestStreak, this._currentStreak);
    this._lastRecordDate = date;
  }

  private isConsecutive(prev: string, next: string): boolean {
    const p = new Date(prev);
    const n = new Date(next);
    const diff = (n.getTime() - p.getTime()) / (1000 * 60 * 60 * 24);
    return diff === 1;
  }

  get currentStreak(): number { return this._currentStreak; }
  get longestStreak(): number { return this._longestStreak; }
}
