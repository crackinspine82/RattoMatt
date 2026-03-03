import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function RapidfireScreen() {
  return (
    <Screen
      title="RapidFire"
      subtitle="Choose session: Quick (10m), Brief (15m), Rally (30m)."
    >
      <SecondaryButton label="Quick Test" href="/student-mode" />
      <SecondaryButton label="Brief Test" href="/student-mode" />
      <SecondaryButton label="Rally Test" href="/student-mode" />
      <PrimaryButton label="Submit Session" href="/student-mode" />
    </Screen>
  );
}
