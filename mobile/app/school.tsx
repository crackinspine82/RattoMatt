import React from 'react';

import { PrimaryButton, Screen, SecondaryButton, TextField } from '@/components/screen';

export default function SchoolScreen() {
  return (
    <Screen
      title="School Context"
      subtitle="Select state and school (branch if applicable)."
    >
      <TextField label="State" placeholder="Select state" />
      <TextField label="School" placeholder="Type to search schools" />
      <SecondaryButton label="Add new school" href="/syllabus" />
      <PrimaryButton label="Continue" href="/subject-picker" />
    </Screen>
  );
}
