import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import ChatScreen from '../src/ui/chat/ChatScreen';

export default function Index() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ChatScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
