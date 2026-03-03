import React from 'react';
import { View } from 'react-native';

import { PrimaryButton, Screen, SecondaryButton } from '@/components/screen';

export default function OnboardingScreen() {
  return (
    <Screen
      title="Board & Grade"
      subtitle="ICSE is preselected. You can change it."
    >
      <View style={{ gap: 8 }}>
        <SecondaryButton label="Board: ICSE" href="/school" />
        <SecondaryButton label="Grade: 10" href="/school" />
      </View>
      <PrimaryButton label="Continue" href="/school" />
    </Screen>
  );
}
