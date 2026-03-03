import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function GradingScreen() {
  return (
    <Screen
      title="Grading Mode"
      subtitle="Grade each sub-question separately. Best-of-N applies."
    >
      <SecondaryButton label="Correct" href="/grading" />
      <SecondaryButton label="Incorrect" href="/grading" />
      <SecondaryButton label="Partially Correct (0.5 steps)" href="/grading" />
      <SecondaryButton label="Not Attempted" href="/grading" />
      <PrimaryButton label="Submit Scores" href="/dashboard" />
    </Screen>
  );
}
