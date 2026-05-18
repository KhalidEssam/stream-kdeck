import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface Props {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); return; }
        onAuthenticated();
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) { setError(err.message); return; }
        setInfo('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
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
        <Text style={styles.tagline}>
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
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
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {info  && <Text style={styles.info}>{info}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchMode}
          onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.switchModeText}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0F0F14' },
  inner:           { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo:            { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  tagline:         { color: '#6B6B8A', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor:  '#1A1A2E',
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.1)',
    borderRadius:     10,
    paddingHorizontal: 14,
    paddingVertical:  12,
    color:            '#FFFFFF',
    fontSize:         15,
    marginBottom:     12,
  },
  error:          { color: '#FF6B6B', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  info:           { color: '#44FF88', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  switchMode:     { marginTop: 20, alignItems: 'center' },
  switchModeText: { color: '#6B6B8A', fontSize: 13 },
});
