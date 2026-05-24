import { SECURITY_PROFILES, getSecurityProfile, getCriticalRules, generateSecurityPrompt } from '../../agents/_shared/security-profile';
import { AgentId } from '../../shared/types';

describe('Security Profiles', () => {
  describe('profile definitions', () => {
    test('all 5 agents have profiles', () => {
      const agents: AgentId[] = ['master', 'ledger', 'analyst', 'coach', 'guardian'];
      for (const id of agents) {
        expect(SECURITY_PROFILES[id]).toBeDefined();
        expect(SECURITY_PROFILES[id].agentId).toBe(id);
      }
    });

    test('master agent cannot exceed L0 permission', () => {
      const profile = SECURITY_PROFILES.master;
      expect(profile.maxPermissionLevel).toBe(0);
    });

    test('guardian is the only agent with L2 permission', () => {
      for (const [id, profile] of Object.entries(SECURITY_PROFILES)) {
        if (id === 'guardian') {
          expect(profile.maxPermissionLevel).toBe(2);
        } else {
          expect(profile.maxPermissionLevel).toBeLessThan(2);
        }
      }
    });

    test('all agents have prohibitions', () => {
      for (const [, profile] of Object.entries(SECURITY_PROFILES)) {
        expect(profile.prohibitions.length).toBeGreaterThan(0);
      }
    });

    test('all agents have critical rules', () => {
      for (const [, profile] of Object.entries(SECURITY_PROFILES)) {
        const criticals = profile.rules.filter(r => r.severity === 'critical');
        expect(criticals.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getSecurityProfile', () => {
    test('returns correct profile for each agent', () => {
      expect(getSecurityProfile('ledger').agentName).toBe('Ledger');
      expect(getSecurityProfile('analyst').agentName).toBe('Analyst');
      expect(getSecurityProfile('coach').agentName).toBe('Coach');
      expect(getSecurityProfile('guardian').agentName).toBe('Guardian');
      expect(getSecurityProfile('master').agentName).toBe('Master');
    });
  });

  describe('getCriticalRules', () => {
    test('returns only critical severity rules', () => {
      const rules = getCriticalRules('ledger');
      for (const r of rules) {
        expect(r.severity).toBe('critical');
      }
    });

    test('guardian has most critical rules', () => {
      const guardianRules = getCriticalRules('guardian');
      const ledgerRules = getCriticalRules('ledger');
      expect(guardianRules.length).toBeGreaterThanOrEqual(ledgerRules.length);
    });
  });

  describe('generateSecurityPrompt', () => {
    test('generates non-empty prompt for each agent', () => {
      const agents: AgentId[] = ['master', 'ledger', 'analyst', 'coach', 'guardian'];
      for (const id of agents) {
        const prompt = generateSecurityPrompt(id);
        expect(prompt.length).toBeGreaterThan(100);
        expect(prompt).toContain('安全');
        expect(prompt).toContain('禁止');
      }
    });

    test('prompt includes check items', () => {
      const prompt = generateSecurityPrompt('ledger');
      expect(prompt).toContain('操作前');
      expect(prompt).toContain('权限范围');
      expect(prompt).toContain('审计日志');
    });
  });

  describe('prohibitions content', () => {
    test('master agent cannot directly write bills', () => {
      const masterProhibitions = SECURITY_PROFILES.master.prohibitions.join(' ');
      expect(masterProhibitions).toContain('add_bill');
      expect(masterProhibitions).toContain('写入');
    });

    test('ledger agent cannot perform security scans', () => {
      const ledgerProhibitions = SECURITY_PROFILES.ledger.prohibitions.join(' ');
      expect(ledgerProhibitions).toContain('安全');
    });

    test('analyst agent is read-only', () => {
      const analystProhibitions = SECURITY_PROFILES.analyst.prohibitions.join(' ');
      expect(analystProhibitions).toContain('修改');
      expect(analystProhibitions).toContain('写入');
    });

    test('coach agent cannot access raw transaction data', () => {
      const coachProhibitions = SECURITY_PROFILES.coach.prohibitions.join(' ');
      expect(coachProhibitions).toContain('原始');
      expect(coachProhibitions).toContain('数据');
    });

    test('guardian agent cannot upload data to cloud', () => {
      const guardianProhibitions = SECURITY_PROFILES.guardian.prohibitions.join(' ');
      expect(guardianProhibitions).toContain('云');
      expect(guardianProhibitions).toContain('上传');
    });
  });
});
