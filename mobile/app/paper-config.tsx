import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function PaperConfigScreen() {
  return (
    <Screen
      title="Configure Paper"
      subtitle="Duration and difficulty mix (easy/medium/difficult/complex)."
    >
      <SecondaryButton label="45 mins / 20 marks" href="/paper-preview" />
      <PrimaryButton label="Preview Paper" href="/paper-preview" />
    </Screen>
  );
}
