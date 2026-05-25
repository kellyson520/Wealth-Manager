export interface Repository<T, ID> {
  save(entity: T): Promise<void>;
  findById(id: ID): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}

export interface ReadOnlyRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  findAll(limit?: number, offset?: number): Promise<T[]>;
}
