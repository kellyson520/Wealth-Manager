import { Bill } from '../domain/billing/aggregates/Bill';
import type { BillRepository } from '../domain/billing/repositories/BillRepository';
import type { RecordBillCommand, BillSearchCriteria } from '../domain/billing/types';
import type { DomainEventBus } from '../infrastructure/events/DomainEventBusImpl';

export class BillingService {
  constructor(
    private readonly billRepo: BillRepository,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async recordBill(cmd: RecordBillCommand): Promise<Bill> {
    if (cmd.amount <= 0 || cmd.amount > 99999999) {
      throw new Error('金额必须在 0 ~ 99999999 之间');
    }

    const bill = Bill.record(cmd);

    await this.billRepo.save(bill);

    await this.eventBus?.publishAll([...bill.domainEvents]);
    bill.clearEvents();

    return bill;
  }

  async getBill(id: string): Promise<Bill | null> {
    return this.billRepo.findById(id);
  }

  async searchBills(criteria: BillSearchCriteria): Promise<Bill[]> {
    return this.billRepo.search(criteria);
  }

  async modifyBill(
    id: string,
    changes: { amount?: number; category?: string; merchant?: string; note?: string; date?: string; type?: string }
  ): Promise<Bill> {
    const bill = await this.billRepo.findById(id);
    if (!bill) throw new Error('账单不存在');

    if (changes.amount !== undefined) {
      if (!Number.isFinite(changes.amount) || Math.abs(changes.amount) > 99999999) {
        throw new Error('金额必须在 0 ~ 99999999 之间');
      }
      bill.modifyAmount(changes.amount);
    }
    if (changes.category) bill.modifyCategory(changes.category);
    if (changes.merchant) bill.modifyMerchant(changes.merchant);
    if (changes.note !== undefined) bill.modifyNote(changes.note);
    if (changes.date) bill.modifyDate(changes.date);
    if (changes.type) bill.modifyType(changes.type as 'income' | 'expense' | 'refund');

    await this.billRepo.save(bill);

    await this.eventBus?.publishAll([...bill.domainEvents]);
    bill.clearEvents();

    return bill;
  }

  async deleteBill(id: string): Promise<void> {
    const bill = await this.billRepo.findById(id);
    if (!bill) throw new Error('账单不存在');

    bill.markDeleted();

    await this.billRepo.delete(id);

    await this.eventBus?.publishAll([...bill.domainEvents]);
  }
}
