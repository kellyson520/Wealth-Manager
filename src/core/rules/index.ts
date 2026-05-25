export { initRulesTable } from './rule-store';
export {
  addRule,
  searchRules,
  updateRule,
  deleteRule,
} from './rule-store';
export {
  matchRules,
  guessCategory,
  extractActions,
  configureEngine,
  getEngineConfig,
} from './rule-engine';
export {
  parseConditionExpr,
  evaluateCondition,
  evaluateConditionGroup,
  conditionToString,
} from './condition-parser';
export {
  recordCorrection,
  getLearningStats,
  applyLearnedRules,
} from './rule-learner';
export type {
  ClassificationRule,
  RuleMatchResult,
  RuleCondition,
  RuleConditionGroup,
  RuleAction,
  RuleQueryParams,
  RuleEngineConfig,
  RuleConditionOperator,
  RuleMatchOperator,
  RuleActionType,
} from './rule-types';
