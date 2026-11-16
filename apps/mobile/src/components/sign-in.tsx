import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { colors, space } from '@dirary/ui';

import { Mascot } from '@/components/mascot';
import { Button, Card, Text, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const centered = { flex: 1, backgroundColor: colors.night, justifyContent: 'center', padding: space[6] } as const;

export function SetupNeeded() {
  return (
    <View style={centered}>
      <Card style={{ alignItems: 'center' }}>
        <Mascot mood="sleepy" size={140} />
        <Text variant="heading">Connect Supabase</Text>
        <Text muted style={{ textAlign: 'center' }}>
          Copy apps/mobile/.env.example to .env.local, fill in your project URL and publishable key, then restart the dev server.
        </Text>
      </Card>
    </View>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={centered} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Mascot mood="happy" size={140} />
          <Text variant="title">Dirary</Text>
          <Text muted style={{ textAlign: 'center' }}>Sign in to your diary of tasks, money and health.</Text>
        </View>
        <TextInput
          accessibilityLabel="Email" placeholder="Email" placeholderTextColor={colors.faint} style={styles.input}
          autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput
          accessibilityLabel="Password" placeholder="Password" placeholderTextColor={colors.faint} style={styles.input}
          secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {error && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{error}</Text>}
        <Button primary label={busy ? 'Signing in…' : 'Sign in'} disabled={busy || !email || !password} onPress={submit} />
      </Card>
    </KeyboardAvoidingView>
  );
}
