import React from 'react';
import { Screen, PrimaryButton, TextField } from '@/components/screen';

export default function ParentNameScreen() {
  return (
    <Screen title="Your Name" subtitle="We will personalize your experience.">
      <TextField label="Parent name" placeholder="First name" />
      <PrimaryButton label="Continue" href="/child-name" />
    </Screen>
  );
}
