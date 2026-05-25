import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../logger/logger';

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  category: 'tools' | 'agents' | 'ui' | 'integration' | 'utility';
  entryPoint: string;
  permissions: string[];
  dependencies: string[];
  enabled: boolean;
  installedAt: string;
  lastUsedAt?: string;
}

export interface SkillRegistry {
  skills: Map<string, SkillDefinition>;
  loadOrder: string[];
}

const registry: SkillRegistry = {
  skills: new Map(),
  loadOrder: [],
};

export function registerSkill(
  def: Omit<SkillDefinition, 'enabled' | 'installedAt'>
): boolean {
  if (registry.skills.has(def.name)) {
    return false;
  }

  const skill: SkillDefinition = {
    ...def,
    enabled: true,
    installedAt: new Date().toISOString(),
  };

  registry.skills.set(def.name, skill);
  if (!registry.loadOrder.includes(def.name)) {
    registry.loadOrder.push(def.name);
  }

  for (const dep of def.dependencies) {
    if (!registry.skills.has(dep)) {
      registry.skills.set(def.name, { ...skill, enabled: false });
      return false;
    }
  }

  return true;
}

export function installSkill(def: SkillDefinition): boolean {
  if (registry.skills.has(def.name)) {
    return false;
  }

  registry.skills.set(def.name, { ...def, enabled: true, installedAt: new Date().toISOString() });
  if (!registry.loadOrder.includes(def.name)) {
    registry.loadOrder.push(def.name);
  }

  return true;
}

export function uninstallSkill(name: string): boolean {
  const existed = registry.skills.delete(name);
  if (existed) {
    registry.loadOrder = registry.loadOrder.filter((n) => n !== name);
  }
  return existed;
}

export function enableSkill(name: string): boolean {
  const skill = registry.skills.get(name);
  if (!skill) return false;

  for (const dep of skill.dependencies) {
    const depSkill = registry.skills.get(dep);
    if (!depSkill || !depSkill.enabled) {
      return false;
    }
  }

  skill.enabled = true;
  return true;
}

export function disableSkill(name: string): boolean {
  const skill = registry.skills.get(name);
  if (!skill) return false;
  skill.enabled = false;
  return true;
}

export function getSkill(name: string): SkillDefinition | undefined {
  return registry.skills.get(name);
}

export function listSkills(category?: string): SkillDefinition[] {
  const all = Array.from(registry.skills.values());
  if (category) {
    return all.filter((s) => s.category === category);
  }
  return all;
}

export function listEnabledSkills(): SkillDefinition[] {
  return Array.from(registry.skills.values()).filter((s) => s.enabled);
}

export function getSkillStats(): {
  total: number;
  enabled: number;
  byCategory: Record<string, number>;
} {
  const all = Array.from(registry.skills.values());
  const enabled = all.filter((s) => s.enabled).length;
  const byCategory: Record<string, number> = {};
  for (const s of all) {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  }
  return { total: all.length, enabled, byCategory };
}

export function touchSkill(name: string): void {
  const skill = registry.skills.get(name);
  if (skill) {
    skill.lastUsedAt = new Date().toISOString();
  }
}

export function verifyDependencies(name: string): { valid: boolean; missing: string[] } {
  const skill = registry.skills.get(name);
  if (!skill) return { valid: false, missing: [name] };

  const missing: string[] = [];
  for (const dep of skill.dependencies) {
    const depSkill = registry.skills.get(dep);
    if (!depSkill || !depSkill.enabled) {
      missing.push(dep);
    }
  }

  return { valid: missing.length === 0, missing };
}

export async function initializeDefaultSkills(): Promise<void> {
  const defaults: Omit<SkillDefinition, 'enabled' | 'installedAt' | 'lastUsedAt'>[] = [
    {
      name: 'bills-core',
      version: '1.0.0',
      description: 'Core bill recording and search',
      category: 'tools', entryPoint: 'tools/bills',
      permissions: ['L0', 'L1'], dependencies: [],
    },
    {
      name: 'analytics-engine',
      version: '1.0.0',
      description: 'Statistics, trends, and anomaly analysis',
      category: 'tools', entryPoint: 'tools/stats',
      permissions: ['L0'], dependencies: [],
    },
    {
      name: 'rule-engine',
      version: '1.0.0',
      description: 'Classification rules and pattern matching',
      category: 'tools', entryPoint: 'core/rules',
      permissions: ['L0', 'L1'], dependencies: [],
    },
    {
      name: 'sync-webdav',
      version: '1.0.0',
      description: 'WebDAV multi-device synchronization',
      category: 'integration', entryPoint: 'tools/webdav',
      permissions: ['L1', 'L2'], dependencies: [],
    },
    {
      name: 'gamification',
      version: '1.0.0',
      description: 'Levels, achievements, streaks, and challenges',
      category: 'tools', entryPoint: 'tools/gamification',
      permissions: ['L0', 'L1'], dependencies: [],
    },
    {
      name: 'vector-search',
      version: '1.0.0',
      description: 'Vector embeddings and semantic similarity search',
      category: 'utility', entryPoint: 'core/vector',
      permissions: ['L0'], dependencies: [],
    },
    {
      name: 'memory-engine',
      version: '1.0.0',
      description: 'Four-layer memory with consolidation',
      category: 'utility', entryPoint: 'core/memory',
      permissions: ['L0', 'L1'], dependencies: [],
    },
    {
      name: 'persona-engine',
      version: '1.0.0',
      description: 'Persona parameters and mood adaptation',
      category: 'utility', entryPoint: 'core/persona',
      permissions: ['L0', 'L1'], dependencies: ['memory-engine'],
    },
  ];

  for (const def of defaults) {
    registerSkill(def);
  }
}
