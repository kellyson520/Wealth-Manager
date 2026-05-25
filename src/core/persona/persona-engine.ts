import { getDatabase } from '../database/database';
import { captureError } from '../logger/logger';
import type { PersonaParams, UserPreferences } from '../../shared/types';

interface PersonaConfig {
  personaParams: PersonaParams;
  preferences: UserPreferences;
  mood: 'neutral' | 'positive' | 'cautious' | 'motivating';
  activeHours: { start: number; end: number };
}

const defaultConfig: PersonaConfig = {
  personaParams: { rigor: 5, humor: 5, proactivity: 5 },
  preferences: { currency: 'CNY', language: 'zh-Hans', theme: 'dark', firstDayOfWeek: 1 },
  mood: 'neutral',
  activeHours: { start: 8, end: 23 },
};

let currentConfig: PersonaConfig = { ...defaultConfig };

export async function loadPersona(): Promise<PersonaConfig> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      persona_params: string;
      preferences: string;
    }>("SELECT persona_params, preferences FROM user_profile WHERE id = 'singleton'");

    if (row) {
      try { currentConfig.personaParams = JSON.parse(row.persona_params); } catch { /* keep default */ }
      try { currentConfig.preferences = JSON.parse(row.preferences); } catch { /* keep default */ }
    }
    return { ...currentConfig };
  } catch (e) {
    captureError('Persona.loadPersona', e, 'Failed to load persona');
    return { ...defaultConfig };
  }
}

export function getPersona(): PersonaConfig {
  return { ...currentConfig };
}

export function getPersonaParams(): PersonaParams {
  return { ...currentConfig.personaParams };
}

export function getPreferences(): UserPreferences {
  return { ...currentConfig.preferences };
}

export async function adjustRigor(direction: 'up' | 'down', amount: number = 0.5): Promise<PersonaParams> {
  const newVal = Math.max(0, Math.min(10, currentConfig.personaParams.rigor + (direction === 'up' ? amount : -amount)));
  currentConfig.personaParams.rigor = newVal;
  await persistPersona();
  return getPersonaParams();
}

export async function adjustHumor(direction: 'up' | 'down', amount: number = 0.5): Promise<PersonaParams> {
  const newVal = Math.max(0, Math.min(10, currentConfig.personaParams.humor + (direction === 'up' ? amount : -amount)));
  currentConfig.personaParams.humor = newVal;
  await persistPersona();
  return getPersonaParams();
}

export async function adjustProactivity(direction: 'up' | 'down', amount: number = 0.5): Promise<PersonaParams> {
  const newVal = Math.max(0, Math.min(10, currentConfig.personaParams.proactivity + (direction === 'up' ? amount : -amount)));
  currentConfig.personaParams.proactivity = newVal;
  await persistPersona();
  return getPersonaParams();
}

export async function setPersonaParams(params: Partial<PersonaParams>): Promise<PersonaParams> {
  if (params.rigor !== undefined) currentConfig.personaParams.rigor = Math.max(0, Math.min(10, params.rigor));
  if (params.humor !== undefined) currentConfig.personaParams.humor = Math.max(0, Math.min(10, params.humor));
  if (params.proactivity !== undefined) currentConfig.personaParams.proactivity = Math.max(0, Math.min(10, params.proactivity));
  await persistPersona();
  return getPersonaParams();
}

export async function setPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  Object.assign(currentConfig.preferences, prefs);
  await persistPreferences();
  return getPreferences();
}

export async function updateMood(): Promise<string> {
  try {
    const db = await getDatabase();
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const todayExpense = await db.getFirstAsync<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date = ?",
      [today]
    );

    const streakRows = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM bills WHERE date IS NOT NULL GROUP BY date ORDER BY date DESC LIMIT 10"
    );
    const dates = streakRows.map((r) => r.date);
    const checkDate = new Date(today);
    let streak = 0;
    while (dates.includes(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const hour = now.getHours();
    const isActiveHours = hour >= currentConfig.activeHours.start && hour < currentConfig.activeHours.end;

    if (!isActiveHours) {
      currentConfig.mood = 'cautious';
    } else if ((todayExpense?.total || 0) > 500) {
      currentConfig.mood = 'cautious';
    } else if (streak >= 7) {
      currentConfig.mood = 'motivating';
    } else if (streak >= 3) {
      currentConfig.mood = 'positive';
    } else {
      currentConfig.mood = 'neutral';
    }

    return currentConfig.mood;
  } catch (e) {
    captureError('Persona.updateMood', e, 'Failed to update mood');
    return currentConfig.mood;
  }
}

export function generatePersonaPrompt(): string {
  const p = currentConfig.personaParams;
  const m = currentConfig.mood;

  const moodDesc: Record<string, string> = {
    neutral: '保持客观冷静',
    positive: '语气积极乐观',
    cautious: '更加谨慎保守',
    motivating: '激励用户达成目标',
  };

  let prompt = '## 人设参数\n';
  prompt += `严谨度: ${'■'.repeat(Math.round(p.rigor))}${'□'.repeat(10 - Math.round(p.rigor))} ${p.rigor.toFixed(1)}/10 | `;
  prompt += `幽默度: ${'■'.repeat(Math.round(p.humor))}${'□'.repeat(10 - Math.round(p.humor))} ${p.humor.toFixed(1)}/10 | `;
  prompt += `主动性: ${'■'.repeat(Math.round(p.proactivity))}${'□'.repeat(10 - Math.round(p.proactivity))} ${p.proactivity.toFixed(1)}/10\n`;
  prompt += `当前状态: ${moodDesc[m] || '正常'} (${m})\n`;
  prompt += `货币: ${currentConfig.preferences.currency} | 主题: ${currentConfig.preferences.theme}\n`;

  return prompt;
}

async function persistPersona(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE user_profile SET persona_params = ? WHERE id = 'singleton'",
      [JSON.stringify(currentConfig.personaParams)]
    );
  } catch (e) {
    captureError('Persona.persistPersona', e, 'Failed to persist persona');
  }
}

async function persistPreferences(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE user_profile SET preferences = ? WHERE id = 'singleton'",
      [JSON.stringify(currentConfig.preferences)]
    );
  } catch (e) {
    captureError('Persona.persistPreferences', e, 'Failed to persist preferences');
  }
}
