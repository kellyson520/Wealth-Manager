import type { Asset, Debt } from '../aggregates/Asset';

export interface AssetRepository {
  save(asset: Asset): Promise<void>;
  findById(id: string): Promise<Asset | null>;
  findAll(): Promise<Asset[]>;
  delete(id: string): Promise<boolean>;
}

export interface DebtRepository {
  save(debt: Debt): Promise<void>;
  findById(id: string): Promise<Debt | null>;
  findAll(): Promise<Debt[]>;
  delete(id: string): Promise<boolean>;
}
