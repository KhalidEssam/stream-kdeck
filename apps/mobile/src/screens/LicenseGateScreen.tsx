import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

interface Props {
  onRequestActivation: () => void;
}

const PURCHASE_URL =
  process.env.EXPO_PUBLIC_PURCHASE_URL ?? 'https://placeholder-website.example/buy';

export function LicenseGateScreen({ onRequestActivation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>License Required</Text>
        <Text style={styles.body}>
          KDeck requires a Desktop License ($19 one-time) to unlock the full
          experience including AI tools, keyboard shortcuts, and app launcher.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => Linking.openURL(PURCHASE_URL)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Buy License — $19</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>Already purchased?</Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onRequestActivation}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Activate on Desktop</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tap "Activate on Desktop" to open the activation dialog on your PC, then
          enter your license key.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0F0F14' },
  inner: {
    flex:              1,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 32,
  },
  icon:  { fontSize: 48, marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  body:  {
    color:         '#888',
    fontSize:      14,
    lineHeight:    22,
    textAlign:     'center',
    marginBottom:  32,
  },
  primaryButton: {
    backgroundColor: '#5B4FE8',
    borderRadius:    12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width:           '100%',
    alignItems:      'center',
    marginBottom:    20,
  },
  primaryButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  divider:             { color: '#555', fontSize: 13, marginBottom: 16 },
  secondaryButton: {
    borderWidth:     1,
    borderColor:     'rgba(91,79,232,0.5)',
    borderRadius:    12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    width:           '100%',
    alignItems:      'center',
    marginBottom:    16,
  },
  secondaryButtonText: { color: '#5B4FE8', fontSize: 15, fontWeight: '600' },
  hint: { color: '#444', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
