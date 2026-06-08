import {
  ClassificationRule,
  RuleMatchResult,
  RuleEngineConfig,
  RuleAction,
} from './rule-types';
import {
  evaluateConditionGroup,
  countConditions,
  countMatchedConditions,
} from './condition-parser';
import { searchRules, recordRuleHit } from './rule-store';

const defaultConfig: RuleEngineConfig = {
  maxRulesPerMatch: 10,
  minConfidence: 0.5,
  enableAutoLearn: false,
  autoLearnThreshold: 3,
};

let engineConfig: RuleEngineConfig = { ...defaultConfig };

export function configureEngine(config: Partial<RuleEngineConfig>): void {
  engineConfig = { ...engineConfig, ...config };
}

export function getEngineConfig(): RuleEngineConfig {
  return { ...engineConfig };
}

export async function matchRules(
  facts: Record<string, unknown>,
  config?: Partial<RuleEngineConfig>
): Promise<RuleMatchResult[]> {
  const effectiveConfig = { ...engineConfig, ...config };
  const allRules = await searchRules({ enabled: true, limit: 200 });

  const activeRules = allRules
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  const results: RuleMatchResult[] = [];

  for (const rule of activeRules) {
    if (results.length >= effectiveConfig.maxRulesPerMatch) break;

    const totalCond = countConditions(rule.conditions);
    const matchedCond = countMatchedConditions(rule.conditions, facts);
    const groupResult = evaluateConditionGroup(rule.conditions, facts);

    if (matchedCond === 0 || !groupResult) continue;

    const condRatio = totalCond > 0 ? matchedCond / totalCond : 0;
    const matchResult: RuleMatchResult = {
      rule,
      matchedConditions: matchedCond,
      totalConditions: totalCond,
      actions: rule.actions,
      confidence: condRatio,
    };

    matchResult.confidence = Math.max(matchResult.confidence, 0.8);

    if (matchResult.confidence >= effectiveConfig.minConfidence) {
      results.push(matchResult);
      recordRuleHit(rule.id).catch(() => {});
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

export function extractActions(results: RuleMatchResult[]): {
  actions: RuleAction[];
  bestRule: ClassificationRule | null;
  confidence: number;
} {
  if (results.length === 0) {
    return { actions: [], bestRule: null, confidence: 0 };
  }

  const best = results[0];
  const actions: RuleAction[] = [];

  for (const result of results) {
    for (const action of result.actions) {
      const existingAction = actions.find(
        (a) => a.type === action.type && a.target === action.target && a.value === action.value
      );
      if (!existingAction) {
        actions.push({
          ...action,
          confidence: (action.confidence || 0.5) * result.confidence,
        });
      }
    }
  }

  return {
    actions,
    bestRule: best.rule,
    confidence: best.confidence,
  };
}

export async function guessCategory(
  facts: Record<string, unknown>
): Promise<{
  category: string;
  confidence: number;
  matchedRules: string[];
}> {
  const results = await matchRules(facts, { maxRulesPerMatch: 5, minConfidence: 0.3 });

  const categoryActions = results
    .flatMap((r) =>
      r.actions
        .filter((a) => a.type === 'set_category')
        .map((a) => ({
          category: String(a.value),
          confidence: (a.confidence || r.confidence) * r.confidence,
          ruleName: r.rule.name,
        }))
    )
    .sort((a, b) => b.confidence - a.confidence);

  if (categoryActions.length === 0) {
    return { category: '其他', confidence: 0, matchedRules: [] };
  }

  const best = categoryActions[0];
  return {
    category: best.category,
    confidence: best.confidence,
    matchedRules: categoryActions.map((a) => a.ruleName),
  };
}
