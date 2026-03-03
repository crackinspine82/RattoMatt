import React from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowLeft,
  BookCopy,
  CalendarDays,
  FileText,
  Library,
} from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useGenerateTestWizard, type TestType } from '@/context/GenerateTestWizardContext';

const ICON_PROPS = { size: 28 as const, color: Colors.light.tint, strokeWidth: 2 };

const TEST_TYPES: { id: TestType; label: string; description: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> | null }[] = [
  {
    id: 'single_chapter',
    label: 'Single chapter',
    description: 'Focus on one chapter. Best for revision after finishing a topic.',
    Icon: FileText,
  },
  {
    id: 'multi_chapter',
    label: 'Multi-chapter',
    description: 'Cover multiple chapters in one test. Good for unit or half-term revision.',
    Icon: BookCopy,
  },
  {
    id: 'term',
    label: 'Term',
    description: 'Test across the term syllabus. Ideal before mid-term or term exams.',
    Icon: CalendarDays,
  },
  {
    id: 'full_syllabus',
    label: 'Full syllabus',
    description: 'Full board syllabus. Use before final or mock exams.',
    Icon: Library,
  },
];

export default function TestTypeScreen() {
  const router = useRouter();
  const { subject, testType, setTestType } = useGenerateTestWizard();

  const onContinue = () => {
    if (testType) router.push('/paper-preview');
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Pick test type</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {subject?.title ?? 'Subject'} – tap an option to see the description, then continue.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {TEST_TYPES.map((opt) => {
          const selected = testType === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionCard, selected && styles.optionCardSelected]}
              onPress={() => setTestType(opt.id)}
              activeOpacity={0.8}
            >
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  {opt.Icon ? <opt.Icon {...ICON_PROPS} /> : <View style={styles.placeholderIcon} />}
                </View>
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </View>
              {selected && (
                <Text style={styles.optionDescription}>{opt.description}</Text>
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.continueBtn, !testType && styles.continueBtnDisabled]}
          onPress={onContinue}
          disabled={!testType}
          activeOpacity={0.8}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, paddingTop: 48, backgroundColor: Colors.light.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pageTitle: { flex: 1, fontSize: 28, color: Colors.light.text, fontFamily: Fonts.headingSemiBold },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.card, borderWidth: 1,
    borderColor: Colors.light.border, alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body, marginBottom: 24 },
  scroll: { flex: 1 },
  wrap: { paddingBottom: 32 },
  optionCard: {
    backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 2, borderColor: Colors.light.border,
    padding: 16, marginBottom: 12,
  },
  optionCardSelected: { borderColor: Colors.light.tint, backgroundColor: 'rgba(110, 98, 229, 0.06)' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  optionIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(110, 98, 229, 0.12)', alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(110, 98, 229, 0.2)' },
  optionLabel: { flex: 1, fontSize: 18, color: Colors.light.text, fontFamily: Fonts.headingSemiBold },
  optionDescription: { marginTop: 12, fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body, lineHeight: 22 },
  continueBtn: {
    marginTop: 24, backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    shadowColor: Colors.light.tint, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  continueBtnDisabled: { backgroundColor: Colors.light.border, shadowOpacity: 0 },
  continueBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.headingSemiBold },
});
