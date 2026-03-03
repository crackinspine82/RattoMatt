import React from 'react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Bell, FileText, Play } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useGenerateTestWizard } from '@/context/GenerateTestWizardContext';

export default function PaperPreviewScreen() {
  const router = useRouter();
  const { subject, testType } = useGenerateTestWizard();

  const onGenerate = () => {
    // Generate paper only, no DB commit. Placeholder.
    Alert.alert('Paper generated', 'Your paper is ready to view. Tap "Take Test" when you want to save and print or download.');
  };

  const onTakeTest = () => {
    router.push('/take-test');
  };

  const onRemindMe = () => {
    router.push('/remind-me');
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Your test</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {subject?.title ?? 'Subject'} · {testType?.replace('_', ' ') ?? 'Test type'}
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.actionCard} onPress={onGenerate} activeOpacity={0.8}>
          <View style={styles.actionIconWrap}>
            <FileText size={26} color={Colors.light.tint} strokeWidth={2} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Generate New Test</Text>
            <Text style={styles.actionSub}>Create a fresh paper. No record saved yet.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={onTakeTest} activeOpacity={0.8}>
          <View style={styles.actionIconWrap}>
            <Play size={26} color={Colors.light.tint} strokeWidth={2} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Take Test Now</Text>
            <Text style={styles.actionSub}>Save to DB, then print or download PDF.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={onRemindMe} activeOpacity={0.8}>
          <View style={styles.actionIconWrap}>
            <Bell size={26} color={Colors.light.tint} strokeWidth={2} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Remind Me</Text>
            <Text style={styles.actionSub}>Set a date and time to be reminded to take this test.</Text>
          </View>
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
  actionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.light.border, padding: 16, marginBottom: 12,
  },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(110, 98, 229, 0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 17, color: Colors.light.text, fontFamily: Fonts.headingSemiBold },
  actionSub: { fontSize: 13, color: Colors.light.subtext, fontFamily: Fonts.body, marginTop: 4 },
});
