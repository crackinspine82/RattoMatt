import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function StudentModeScreen() {
  return (
    <Screen
      title="Student Mode"
      subtitle="Distraction-free mode. Parent unlock required to exit."
    >
      <PrimaryButton label="Start RapidFire" href="/rapidfire" />
      <SecondaryButton label="Flashcards" href="/flashcards" />
    </Screen>
  );
}
