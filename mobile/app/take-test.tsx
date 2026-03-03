import React from 'react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Download, Printer } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useGenerateTestWizard } from '@/context/GenerateTestWizardContext';

export default function TakeTestScreen() {
  const router = useRouter();
  const { subject, testType } = useGenerateTestWizard();

  const onPrint = () => {
    // Placeholder: expo-print / Save as PDF later. PDF with RattoMatt logo + encrypted customer ID.
    Alert.alert('Print', 'Print or Save as PDF will be available here. PDF will include RattoMatt logo and encrypted customer ID.');
  };

  const onDownload = () => {
    // Placeholder: save PDF to device later.
    Alert.alert('Download', 'Download PDF to device will be available here.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Take Test</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Test saved. Print or download your paper (RattoMatt logo + encrypted customer ID).
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.actionCard} onPress={onPrint} activeOpacity={0.8}>
          <View style={styles.actionIconWrap}>
            <Printer size={26} color={Colors.light.tint} strokeWidth={2} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Print</Text>
            <Text style={styles.actionSub}>Print to printer or Save as PDF</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={onDownload} activeOpacity={0.8}>
          <View style={styles.actionIconWrap}>
            <Download size={26} color={Colors.light.tint} strokeWidth={2} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Download</Text>
            <Text style={styles.actionSub}>Save PDF to device</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/grading')} activeOpacity={0.8}>
          <Text style={styles.secondaryBtnText}>Go to Grading</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/dashboard')} activeOpacity={0.8}>
          <Text style={styles.linkBtnText}>Back to Dashboard</Text>
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
  secondaryBtn: {
    marginTop: 24, paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card,
  },
  secondaryBtnText: { color: Colors.light.tint, fontSize: 16, fontFamily: Fonts.headingSemiBold },
  linkBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  linkBtnText: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
});
