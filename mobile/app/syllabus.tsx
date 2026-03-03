import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function SyllabusScreen() {
  return (
    <Screen
      title="Syllabus Defaults"
      subtitle="Review auto-included topics. You can edit later."
    >
      <SecondaryButton label="Edit Defaults" href="/dashboard" />
      <PrimaryButton label="Go to Dashboard" href="/dashboard" />
    </Screen>
  );
}
