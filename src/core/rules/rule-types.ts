export type RuleConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'in'
  | 'not_in';

export type RuleMatchOperator = 'and' | 'or';

export type RuleActionType =
  | 'set_category'
  | 'set_tag'
  | 'set_note'
  | 'set_merchant'
  | 'set_type'
  | 'flag_anomaly'
  | 'trigger_reminder'
  | 'apply_template'
  | 'block_operation';

export interface RuleCondition {
  field: string;
  operator: RuleConditionOperator;
  value: string | number | boolean | string[] | number[];
  negate?: boolean;
}

export interface RuleConditionGroup {
  operator: RuleMatchOperator;
  conditions: (RuleCondition | RuleConditionGroup)[];
}

export interface RuleAction {
  type: RuleActionType;
  target: string;
  value: string | number | boolean | string[];
  confidence?: number;
}

export interface ClassificationRule {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  conditions: RuleConditionGroup;
  actions: RuleAction[];
  hitCount: number;
  lastHitAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: 'system' | 'user' | 'agent';
}

export interface RuleMatchResult {
  rule: ClassificationRule;
  matchedConditions: number;
  totalConditions: number;
  actions: RuleAction[];
  confidence: number;
}

export interface RuleQueryParams {
  keyword?: string;
  enabled?: boolean;
  createdBy?: 'system' | 'user' | 'agent';
  limit?: number;
  offset?: number;
}

export interface RuleEngineConfig {
  maxRulesPerMatch: number;
  minConfidence: number;
  enableAutoLearn: boolean;
  autoLearnThreshold: number;
}
