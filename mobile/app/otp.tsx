import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { PrimaryButton, Screen, TextField } from '@/components/screen';

export default function OtpScreen() {
  return (
    <Screen title="Verify OTP" subtitle="Enter the 6-digit code sent to you.">
      <TextField label="OTP Code" placeholder="654321" />
      <PrimaryButton label="Verify" href="/parent-name" />
      <Text style={styles.hint}>Test OTP for MVP: 654321</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.light.subtext,
  },
});
