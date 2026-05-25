import {
  loadPlugin,
  reloadPlugin,
  unloadPlugin,
  getLoadedPlugins,
  getPluginStatus,
  isPluginLoaded,
  validateManifest,
  checkVersionCompatibility,
  parseVersion,
} from '../../core/skills/skill-loader';
import type { PluginManifest } from '../../core/skills/skill-loader';

const baseManifest: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'Test plugin',
  category: 'utility',
  entryPoint: 'test/plugin',
  permissions: ['L0'],
  dependencies: {},
};

describe('SkillLoader - Version Parsing', () => {
  it('should parse simple semver', () => {
    const v = parseVersion('1.2.3');
    expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('should parse version with prefix', () => {
    const v = parseVersion('v2.0.1');
    expect(v.major).toBe(2);
    expect(v.minor).toBe(0);
    expect(v.patch).toBe(1);
  });
});

describe('SkillLoader - Version Compatibility', () => {
  it('exact match should be compatible', () => {
    expect(checkVersionCompatibility('1.0.0', '1.0.0')).toBe(true);
  });

  it('higher patch should be compatible', () => {
    expect(checkVersionCompatibility('1.0.0', '1.0.1')).toBe(true);
  });

  it('lower major should not be compatible', () => {
    expect(checkVersionCompatibility('2.0.0', '1.9.9')).toBe(false);
  });

  it('caret range should allow compatible updates', () => {
    expect(checkVersionCompatibility('^1.0.0', '1.5.0')).toBe(true);
    expect(checkVersionCompatibility('^1.0.0', '2.0.0')).toBe(false);
  });

  it('tilde range should allow patch updates', () => {
    expect(checkVersionCompatibility('~1.2.0', '1.2.5')).toBe(true);
    expect(checkVersionCompatibility('~1.2.0', '1.3.0')).toBe(false);
  });

  it('gte range should allow equal or higher', () => {
    expect(checkVersionCompatibility('>=1.0.0', '1.0.0')).toBe(true);
    expect(checkVersionCompatibility('>=1.0.0', '2.0.0')).toBe(true);
    expect(checkVersionCompatibility('>=2.0.0', '1.9.9')).toBe(false);
  });
});

describe('SkillLoader - Manifest Validation', () => {
  it('should validate a correct manifest', () => {
    const result = validateManifest(baseManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing name', () => {
    const result = validateManifest({ ...baseManifest, name: '' });
    expect(result.valid).toBe(false);
  });

  it('should reject invalid version format', () => {
    const result = validateManifest({ ...baseManifest, version: 'abc' });
    expect(result.valid).toBe(false);
  });

  it('should reject invalid category', () => {
    const result = validateManifest({ ...baseManifest, category: 'invalid' as any });
    expect(result.valid).toBe(false);
  });

  it('should reject null manifest', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
  });

  it('should reject missing entryPoint', () => {
    const result = validateManifest({ ...baseManifest, entryPoint: '' });
    expect(result.valid).toBe(false);
  });
});

describe('SkillLoader - Load / Unload / Reload', () => {
  afterEach(() => {
    unloadPlugin('test-plugin');
  });

  it('should load a plugin', () => {
    const result = loadPlugin(baseManifest);
    expect(result.success).toBe(true);
    expect(isPluginLoaded('test-plugin')).toBe(true);
  });

  it('should not load duplicate plugin', () => {
    loadPlugin(baseManifest);
    const result = loadPlugin(baseManifest);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already loaded');
  });

  it('should get plugin status', () => {
    loadPlugin(baseManifest);
    const status = getPluginStatus('test-plugin');
    expect(status).toBeDefined();
    expect(status!.status).toBe('active');
  });

  it('should list loaded plugins', () => {
    loadPlugin(baseManifest);
    const plugins = getLoadedPlugins();
    expect(plugins.length).toBe(1);
    expect(plugins[0].manifest.name).toBe('test-plugin');
  });

  it('should unload a plugin', () => {
    loadPlugin(baseManifest);
    const result = unloadPlugin('test-plugin');
    expect(result).toBe(true);
    expect(isPluginLoaded('test-plugin')).toBe(false);
  });

  it('should reload a plugin', () => {
    loadPlugin(baseManifest);
    const result = reloadPlugin('test-plugin');
    expect(result.success).toBe(true);
    expect(isPluginLoaded('test-plugin')).toBe(true);
  });
});
