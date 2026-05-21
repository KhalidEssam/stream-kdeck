import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useOtaUpdatePrompt() {
  const isCheckingRef = useRef(false);
  const hasPromptedRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const { isUpdatePending } = Updates.useUpdates();

  const promptForRestart = useCallback(() => {
    if (hasPromptedRef.current) return;

    hasPromptedRef.current = true;
    Alert.alert(
      'Update ready',
      'A new version of KDeck has been downloaded. Restart now to use the latest version?',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Restart',
          onPress: () => {
            Updates.reloadAsync().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              console.warn('[updates] reload failed', message);
              hasPromptedRef.current = false;
            });
          },
        },
      ],
    );
  }, []);

  const checkForUpdate = useCallback(async (force = false) => {
    if (__DEV__ || !Updates.isEnabled || isCheckingRef.current) return;

    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < MIN_CHECK_INTERVAL_MS) return;

    isCheckingRef.current = true;
    lastCheckAtRef.current = now;

    try {
      const checkResult = await Updates.checkForUpdateAsync();
      if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) return;

      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
        promptForRestart();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[updates] update check failed', message);
    } finally {
      isCheckingRef.current = false;
    }
  }, [promptForRestart]);

  useEffect(() => {
    if (!isUpdatePending) return;
    promptForRestart();
  }, [isUpdatePending, promptForRestart]);

  useEffect(() => {
    void checkForUpdate(true);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);
}
