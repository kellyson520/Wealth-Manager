import { registerSkill, uninstallSkill } from './skill-registry';
import type { SkillDefinition } from './skill-registry';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  category: 'tools' | 'agents' | 'ui' | 'integration' | 'utility';
  entryPoint: string;
  permissions: string[];
  dependencies: Record<string, string>;
  hooks?: {
    onLoad?: string;
    onUnload?: string;
    onEnable?: string;
    onDisable?: string;
  };
}

export interface LoadedPlugin {
  definition: SkillDefinition;
  manifest: PluginManifest;
  loadedAt: string;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

export function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const parts = version
    .replace(/[^0-9.]/g, '')
    .split('.')
    .map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

export function checkVersionCompatibility(
  required: string,
  actual: string
): boolean {
  try {
    const req = parseVersion(required);
    const act = parseVersion(actual);

    const range = required.trim();

    if (range.startsWith('^')) {
      if (act.major !== req.major) return false;
      if (act.major === 0) {
        if (req.minor === 0) return act.patch >= req.patch;
        return act.minor === req.minor && act.patch >= req.patch;
      }
      return act.minor > req.minor || (act.minor === req.minor && act.patch >= req.patch);
    }

    if (range.startsWith('~')) {
      if (act.major !== req.major) return false;
      if (act.minor !== req.minor) return false;
      return act.patch >= req.patch;
    }

    if (range.startsWith('>=')) {
      return (
        act.major > req.major ||
        (act.major === req.major && act.minor > req.minor) ||
        (act.major === req.major && act.minor === req.minor && act.patch >= req.patch)
      );
    }

    if (range.startsWith('>')) {
      return (
        act.major > req.major ||
        (act.major === req.major && act.minor > req.minor) ||
        (act.major === req.major && act.minor === req.minor && act.patch > req.patch)
      );
    }

    return (
      act.major === req.major &&
      act.minor === req.minor &&
      act.patch >= req.patch
    );
  } catch {
    return false;
  }
}

export function loadPlugin(manifest: PluginManifest): { success: boolean; error?: string } {
  if (loadedPlugins.has(manifest.name)) {
    return { success: false, error: `Plugin ${manifest.name} already loaded` };
  }

  for (const [depName, depVersion] of Object.entries(manifest.dependencies)) {
    const depPlugin = loadedPlugins.get(depName);
    if (!depPlugin) {
      return { success: false, error: `Missing dependency: ${depName}` };
    }
    if (!checkVersionCompatibility(depVersion, depPlugin.manifest.version)) {
      return {
        success: false,
        error: `Dependency version mismatch: ${depName}@${depVersion} (found ${depPlugin.manifest.version})`,
      };
    }
  }

  const definition: SkillDefinition = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    category: manifest.category,
    entryPoint: manifest.entryPoint,
    permissions: manifest.permissions,
    dependencies: Object.keys(manifest.dependencies),
    enabled: true,
    installedAt: new Date().toISOString(),
  };

  const registered = registerSkill(definition);
  if (!registered) {
    return { success: false, error: `Failed to register skill: ${manifest.name}` };
  }

  const loaded: LoadedPlugin = {
    definition,
    manifest,
    loadedAt: new Date().toISOString(),
    status: 'active',
  };

  loadedPlugins.set(manifest.name, loaded);
  return { success: true };
}

export function reloadPlugin(name: string): { success: boolean; error?: string } {
  const existing = loadedPlugins.get(name);
  if (!existing) {
    return { success: false, error: `Plugin ${name} not found` };
  }

  const manifest = existing.manifest;

  uninstallSkill(name);
  loadedPlugins.delete(name);

  const result = loadPlugin(manifest);
  if (!result.success) {
    loadedPlugins.set(name, { ...existing, status: 'error', errorMessage: result.error });
    return result;
  }

  return { success: true };
}

export function unloadPlugin(name: string): boolean {
  const existing = loadedPlugins.get(name);
  if (!existing) return false;

  uninstallSkill(name);
  loadedPlugins.delete(name);
  return true;
}

export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPluginStatus(name: string): LoadedPlugin | undefined {
  return loadedPlugins.get(name);
}

export function isPluginLoaded(name: string): boolean {
  return loadedPlugins.has(name);
}

export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;

  if (!m.name || typeof m.name !== 'string' || m.name.length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('version is required and must be a string');
  } else if (!/^\d+\.\d+\.\d+/.test(m.version as string)) {
    errors.push('version must follow SemVer format (x.y.z)');
  }

  if (!m.entryPoint || typeof m.entryPoint !== 'string') {
    errors.push('entryPoint is required and must be a string');
  }

  if (!m.category || !['tools', 'agents', 'ui', 'integration', 'utility'].includes(m.category as string)) {
    errors.push('category must be one of: tools, agents, ui, integration, utility');
  }

  return { valid: errors.length === 0, errors };
}
