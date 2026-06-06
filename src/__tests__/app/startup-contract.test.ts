import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readPngSize(relativePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(path.join(projectRoot, relativePath));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('native startup contract', () => {
  test('declares Expo Router peer dependencies required by standalone builds', () => {
    const pkg = readJson('package.json');
    const dependencies = pkg.dependencies || {};

    expect(dependencies['expo-constants']).toBeDefined();
    expect(dependencies['expo-linking']).toBeDefined();
    expect(dependencies['react-dom']).toBeDefined();
    expect(dependencies['expo-sqlite']).toMatch(/^~15\.1\./);
    expect(dependencies['react-native']).toBe('0.76.9');
  });

  test('wraps every route in native gesture and safe area providers at the root layout', () => {
    const rootLayout = readText('app/_layout.tsx');

    expect(rootLayout).toContain("import 'react-native-gesture-handler';");
    expect(rootLayout).toContain('GestureHandlerRootView');
    expect(rootLayout).toContain('SafeAreaProvider');
  });

  test('uses production-sized app icon assets instead of placeholder pixels', () => {
    const appConfig = readJson('app.json').expo;
    const icon = appConfig.icon.replace('./', '');
    const foreground = appConfig.android.adaptiveIcon.foregroundImage.replace('./', '');

    expect(readPngSize(icon)).toEqual({ width: 1024, height: 1024 });
    expect(readPngSize(foreground)).toEqual({ width: 1024, height: 1024 });
  });
});
