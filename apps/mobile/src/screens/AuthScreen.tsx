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

type Step = 'password' | 'otp' | 'setPassword';

interface Props {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserMetadata, setPendingUserMetadata] = useState<Record<string, unknown>>({});

  const signInWithPassword = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (err) {
        setError('Invalid email or password. If you have not created a password yet, use a sign-in code.');
        return;
      }

      if (data.user?.user_metadata?.password_set !== true) {
        await markPasswordSet(data.user?.user_metadata ?? {});
      }
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (err) { setError(err.message); return; }
      setOtpSent(true);
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: 'email',
      });
      if (err) { setError(err.message); return; }

      const metadata = data.user?.user_metadata ?? {};
      if (metadata.password_set === true) {
        onAuthenticated();
        return;
      }

      setPendingUserMetadata(metadata);
      setStep('setPassword');
    } finally {
      setLoading(false);
    }
  };

  const createPassword = async () => {
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({
        password: newPassword,
        data: { ...pendingUserMetadata, password_set: true },
      });
      if (err) { setError(err.message); return; }
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  };

  const markPasswordSet = async (metadata: Record<string, unknown>) => {
    const { error: err } = await supabase.auth.updateUser({
      data: { ...metadata, password_set: true },
    });
    if (err) {
      console.warn('[mobile] Could not mark password_set', err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.logo}>KDeck</Text>

        {step === 'password' && (
          <>
            <Text style={styles.tagline}>Sign in with the email connected to your KDeck purchase</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={signInWithPassword}
              disabled={loading || !email.trim() || !password}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => { setStep('otp'); setOtpSent(false); setToken(''); setError(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.backLinkText}>No password yet? Use a sign-in code</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <Text style={styles.tagline}>
              {otpSent ? `Enter the code sent to ${email.trim()}` : 'Enter the email you used to purchase your license'}
            </Text>
            {!otpSent ? (
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#555"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            ) : (
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
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={otpSent ? verifyOtp : sendOtp}
              disabled={loading || !email.trim() || (otpSent && token.length < 6)}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{otpSent ? 'Verify Code' : 'Send Sign-In Code'}</Text>
              }
            </TouchableOpacity>
            {!otpSent ? (
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setStep('password'); setOtpSent(false); setToken(''); setError(null); }}
                activeOpacity={0.7}
              >
                <Text style={styles.backLinkText}>Use password instead</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setOtpSent(false); setToken(''); setError(null); }}
                activeOpacity={0.7}
              >
                <Text style={styles.backLinkText}>Use a different email</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'setPassword' && (
          <>
            <Text style={styles.tagline}>
              Create a password to use email and password sign-in next time
            </Text>
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#555"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#555"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={createPassword}
              disabled={loading || !newPassword || !confirmPassword}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Create Password</Text>
              }
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
  otpInput:      { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
  error:         { color: '#FF6B6B', fontSize: 13, marginBottom: 10, textAlign: 'center' },
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
