import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type Step = 'email' | 'otp';

interface Props {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [token, setToken]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (err) { setError(err.message); return; }
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (err) { setError(err.message); return; }
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.logo}>Control Surface</Text>

        {step === 'email' ? (
          <>
            <Text style={styles.tagline}>
              Enter the email you used to purchase your license
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={sendOtp}
              disabled={loading || !email.trim()}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Send Sign-In Code</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.tagline}>
              Enter the 6-digit code sent to{'\n'}{email}
            </Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="00000000"
              placeholderTextColor="#555"
              value={token}
              onChangeText={setToken}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={verifyOtp}
              disabled={loading || token.length < 6}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Verify Code</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => { setStep('email'); setToken(''); setError(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.backLinkText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  inner:     { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo:      { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  tagline:   { color: '#6B6B8A', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  input: {
    backgroundColor:   '#1A1A2E',
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.1)',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    color:             '#FFFFFF',
    fontSize:          15,
    marginBottom:      12,
  },
  otpInput:        { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
  error:           { color: '#FF6B6B', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  backLink:       { marginTop: 20, alignItems: 'center' },
  backLinkText:   { color: '#6B6B8A', fontSize: 13 },
});
