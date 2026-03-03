import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

type ButtonProps = {
  label: string;
  href: string;
};

type InputProps = {
  label: string;
  placeholder?: string;
};

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export function PrimaryButton({ label, href }: ButtonProps) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
      </TouchableOpacity>
    </Link>
  );
}

export function SecondaryButton({ label, href }: ButtonProps) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{label}</Text>
      </TouchableOpacity>
    </Link>
  );
}

export function TextField({ label, placeholder }: InputProps) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={Colors.light.subtext}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  content: {
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.headingSemiBold,
  },
  secondaryButton: {
    backgroundColor: Colors.light.card,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    borderColor: Colors.light.border,
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: Colors.light.tint,
    fontSize: 16,
    fontFamily: Fonts.headingSemiBold,
  },
  inputWrapper: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.light.subtext,
    fontFamily: Fonts.bodySemiBold,
  },
  input: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    color: Colors.light.text,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
});
