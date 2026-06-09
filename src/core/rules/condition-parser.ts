import { RuleCondition, RuleConditionGroup, RuleConditionOperator } from './rule-types';

const OPERATOR_MAP: Record<string, RuleConditionOperator> = {
  '==': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  '包含': 'contains',
  '不包含': 'not_contains',
  '以...开头': 'starts_with',
  '以...结尾': 'ends_with',
  '匹配': 'regex',
  '在...中': 'in',
  '不在...中': 'not_in',
};

const REVERSE_OPERATOR_MAP: Record<RuleConditionOperator, string> = {
  eq: '==',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: '包含',
  not_contains: '不包含',
  starts_with: '以...开头',
  ends_with: '以...结尾',
  regex: '匹配',
  in: '在...中',
  not_in: '不在...中',
};

export function parseConditionExpr(expr: string): RuleCondition | null {
  const patterns = [
    /^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/,
    /^(\w+)\s+(包含|不包含|以\.\.\.开头|以\.\.\.结尾|匹配|在\.\.\.中|不在\.\.\.中)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = expr.trim().match(pattern);
    if (match) {
      const [, field, opStr, rawValue] = match;
      const operator = OPERATOR_MAP[opStr] || 'eq';

      let value: string | number | boolean | string[] | number[];
      const trimmedValue = rawValue.trim().replace(/^["']|["']$/g, '');

      if (operator === 'in' || operator === 'not_in') {
        value = trimmedValue.split(',').map((v) => v.trim());
      } else if (trimmedValue === 'true') {
        value = true;
      } else if (trimmedValue === 'false') {
        value = false;
      } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
        value = Number(trimmedValue);
      } else {
        value = trimmedValue;
      }

      if (!isValidFieldName(field)) {
        return null;
      }

      return { field, operator, value };
    }
  }

  return null;
}

export function conditionToString(condition: RuleCondition): string {
  const opStr = REVERSE_OPERATOR_MAP[condition.operator] || condition.operator;
  const valueStr = Array.isArray(condition.value)
    ? condition.value.join(', ')
    : String(condition.value);

  let result = `${condition.field} ${opStr} ${valueStr}`;

  if (condition.negate) {
    result = `NOT(${result})`;
  }

  return result;
}

export function evaluateCondition(
  condition: RuleCondition,
  facts: Record<string, unknown>
): boolean {
  const factValue = getFieldValue(condition.field, facts);
  const expectedValue = condition.value;

  let result: boolean;

  switch (condition.operator) {
    case 'eq':
      result = looseEquals(factValue, expectedValue);
      break;
    case 'ne':
      result = !looseEquals(factValue, expectedValue);
      break;
    case 'gt':
      result = compareValues(factValue, expectedValue) > 0;
      break;
    case 'gte':
      result = compareValues(factValue, expectedValue) >= 0;
      break;
    case 'lt':
      result = compareValues(factValue, expectedValue) < 0;
      break;
    case 'lte':
      result = compareValues(factValue, expectedValue) <= 0;
      break;
    case 'contains':
      result =
        typeof factValue === 'string' &&
        String(factValue).includes(String(expectedValue));
      break;
    case 'not_contains':
      result =
        typeof factValue !== 'string' ||
        !String(factValue).includes(String(expectedValue));
      break;
    case 'starts_with':
      result =
        typeof factValue === 'string' &&
        String(factValue).startsWith(String(expectedValue));
      break;
    case 'ends_with':
      result =
        typeof factValue === 'string' &&
        String(factValue).endsWith(String(expectedValue));
      break;
    case 'regex':
      result = safeRegexMatch(String(expectedValue), String(factValue));
      break;
    case 'in':
      result = Array.isArray(expectedValue) && expectedValue.some((v) => looseEquals(factValue, v));
      break;
    case 'not_in':
      result = !(
        Array.isArray(expectedValue) &&
        expectedValue.some((v) => looseEquals(factValue, v))
      );
      break;
    default:
      result = false;
  }

  return condition.negate ? !result : result;
}

export function evaluateConditionGroup(
  group: RuleConditionGroup,
  facts: Record<string, unknown>
): boolean {
  const results = group.conditions.map((c) => {
    if (Object.hasOwn(c, 'operator') && Object.hasOwn(c, 'conditions')) {
      return evaluateConditionGroup(c as RuleConditionGroup, facts);
    }
    return evaluateCondition(c as RuleCondition, facts);
  });

  if (group.operator === 'and') {
    return results.every(Boolean);
  }
  return results.some(Boolean);
}

export function countConditions(group: RuleConditionGroup): number {
  let count = 0;
  for (const c of group.conditions) {
    if (Object.hasOwn(c, 'operator') && Object.hasOwn(c, 'conditions')) {
      count += countConditions(c as RuleConditionGroup);
    } else {
      count++;
    }
  }
  return count;
}

export function countMatchedConditions(
  group: RuleConditionGroup,
  facts: Record<string, unknown>
): number {
  let count = 0;
  for (const c of group.conditions) {
    if (Object.hasOwn(c, 'operator') && Object.hasOwn(c, 'conditions')) {
      count += countMatchedConditions(c as RuleConditionGroup, facts);
    } else {
      if (evaluateCondition(c as RuleCondition, facts)) {
        count++;
      }
    }
  }
  return count;
}

const REGEX_MAX_LENGTH = 100;

const REDOS_SUSPECT_PATTERNS = [
  /\([^)]*\+[^)]*\)\+/,   // (x+)+  nested quantifier on group
  /\([^)]*\*[^)]*\)\*/,   // (x*)*  nested quantifier on group
  /\([^)]*\+[^)]*\)\{/,   // (x+){m,n}
  /\([^)]*\*[^)]*\)\{/,   // (x*){m,n}
  /(.)\1{3,}\1\+/,        // aaaa+a backtracking trigger
];

function safeRegexMatch(pattern: string, input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  if (pattern.length > REGEX_MAX_LENGTH) {
    return false;
  }

  for (const suspect of REDOS_SUSPECT_PATTERNS) {
    if (suspect.test(pattern)) {
      return false;
    }
  }

  try {
    return new RegExp(pattern, 'i').test(input);
  } catch {
    return false;
  }
}

const FORBIDDEN_FIELD_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

export function isValidFieldName(field: string): boolean {
  return !FORBIDDEN_FIELD_NAMES.has(field);
}

function getFieldValue(
  field: string,
  facts: Record<string, unknown>
): unknown {
  if (!isValidFieldName(field)) {
    return undefined;
  }
  return Object.hasOwn(facts, field) ? facts[field] : undefined;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b || String(a) === String(b);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null || b == null) {
    return Number.NaN;
  }

  if (
    (typeof a === 'string' && a.trim() === '') ||
    (typeof b === 'string' && b.trim() === '')
  ) {
    return Number.NaN;
  }

  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  return String(a).localeCompare(String(b));
}
