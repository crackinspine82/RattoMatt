import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export default function PendingPapersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Pending Papers</Text>
      <Text style={styles.subtitle}>Filter by subject or date. Pending only.</Text>

      <View style={styles.filterRow}>
        <FilterChip label="History" active />
        <FilterChip label="Civics" />
        <FilterChip label="Newest" />
      </View>

      <SectionHeader title="Pending" />
      <PaperCard title="History · Chapter Test" subtitle="30 Jan 2026 · 20 marks" />
      <PaperCard title="Civics · Unit Test" subtitle="28 Jan 2026 · 40 marks" />

      <SectionHeader title="Past Tests" />
      <PaperCard title="History · Mock Paper" subtitle="20 Jan 2026 · 80 marks" muted />
      <PaperCard title="Civics · Practice" subtitle="18 Jan 2026 · 40 marks" muted />
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function FilterChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </View>
  );
}

function PaperCard({ title, subtitle, muted }: { title: string; subtitle: string; muted?: boolean }) {
  return (
    <TouchableOpacity style={[styles.card, muted && styles.cardMuted]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
    backgroundColor: Colors.light.background,
  },
  title: {
    fontSize: 28,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.border,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipText: {
    fontSize: 12,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontFamily: Fonts.bodySemiBold,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 10,
    fontSize: 18,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  cardMuted: {
    opacity: 0.6,
  },
  cardTitle: {
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
});
