import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { PrimaryButton, SecondaryButton, Screen, TextField } from '@/components/screen';

export default function AuthScreen() {
  return (
    <Screen title="Welcome to RattoMatt" subtitle="Sign up with minimal typing.">
      <TextField label="Email or phone" placeholder="you@example.com or +91..." />
      <PrimaryButton label="Send OTP" href="/otp" />
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.line} />
      </View>
      <SecondaryButton label="Continue with Google" href="/otp" />
      <Text style={styles.terms}>
        By continuing, you agree to our Terms & Privacy Policy.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.light.subtext,
  },
  terms: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.light.subtext,
  },
});
