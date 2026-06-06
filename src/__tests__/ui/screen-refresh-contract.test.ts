import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('screen refresh error handling contract', () => {
  test.each([
    ['settings refresh', 'src/ui/settings/SettingsScreen.tsx', "captureError('SettingsScreen.refresh'"],
    ['AI cache refresh', 'src/ui/ai/AiCacheScreen.tsx', "captureError('AiCacheScreen.refresh'"],
  ])('%s catches async loading failures', (_name, file, marker) => {
    const source = read(file);

    expect(source).toContain("from '../../core/logger/logger'");
    expect(source).toContain(marker);
  });

  test.each([
    "captureError('SettingsScreen.updatePersona'",
    "captureError('SettingsScreen.updatePreference'",
    "captureError('SettingsScreen.toggleLearning'",
    "captureError('SettingsScreen.savePersonaSnapshot'",
    "captureError('SettingsScreen.rollbackPersona'",
    "captureError('SettingsScreen.approveCandidate'",
    "captureError('SettingsScreen.rejectCandidate'",
  ])('settings mutation failures are logged: %s', (marker) => {
    const source = read('src/ui/settings/SettingsScreen.tsx');

    expect(source).toContain(marker);
  });
});
