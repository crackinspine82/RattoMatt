import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function HomeScreen() {
  return (
    <Screen
      title="RattoMatt Preview"
      subtitle="Tap through key flows to review the MVP visuals."
    >
      <PrimaryButton label="Start Onboarding" href="/splash" />
      <SecondaryButton label="Go to Dashboard" href="/dashboard" />
      <SecondaryButton label="Student Mode" href="/student-mode" />
      <SecondaryButton label="Admin Upload" href="/admin-upload" />
    </Screen>
  );
}
