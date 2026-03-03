import React from 'react';
import { View } from 'react-native';

import { PrimaryButton, SecondaryButton, Screen, TextField } from '@/components/screen';

export default function ChildNameScreen() {
  return (
    <Screen title="Child Profile" subtitle="Add your child to continue.">
      <TextField label="Child name" placeholder="First name only" />
      <View style={{ gap: 8 }}>
        <SecondaryButton label="Add another child" href="/child-name" />
        <PrimaryButton label="Continue" href="/onboarding" />
      </View>
    </Screen>
  );
}
