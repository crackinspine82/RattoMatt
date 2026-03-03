import React from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '@/components/screen';

export default function AdminUploadScreen() {
  return (
    <Screen
      title="Admin Upload"
      subtitle="Upload chapter XLSX + asset ZIP."
    >
      <SecondaryButton label="Select XLSX" href="/admin-upload" />
      <SecondaryButton label="Select ZIP" href="/admin-upload" />
      <PrimaryButton label="Validate & Upload" href="/admin-upload" />
    </Screen>
  );
}
