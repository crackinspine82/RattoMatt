import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function FlashcardsScreen() {
  return (
    <Screen
      title="Flashcards"
      subtitle="Swipe through key concepts."
    >
      <SecondaryButton label="Next Card" href="/flashcards" />
      <PrimaryButton label="End Session" href="/student-mode" />
    </Screen>
  );
}
