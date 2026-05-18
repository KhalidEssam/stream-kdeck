import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeckScreen } from './src/screens/DeckScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <DeckScreen />
    </SafeAreaProvider>
  );
}
