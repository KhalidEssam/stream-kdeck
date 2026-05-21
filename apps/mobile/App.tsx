import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DeckScreen } from './src/screens/DeckScreen';
import { useOtaUpdatePrompt } from './src/hooks/useOtaUpdatePrompt';

export default function App() {
  useOtaUpdatePrompt();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DeckScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
