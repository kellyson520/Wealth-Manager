import { SafeAreaProvider } from 'react-native-safe-area-context';
import LogScreen from '../src/ui/logger/LogScreen';

export default function LogRoute() {
  return (
    <SafeAreaProvider>
      <LogScreen />
    </SafeAreaProvider>
  );
}
