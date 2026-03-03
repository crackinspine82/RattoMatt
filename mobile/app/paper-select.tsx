import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/constants/api';
import { getCoursesForBoardGrade } from '@/constants/courses';
import { useChildSubjects } from '@/context/ChildSubjectsContext';
import { useGenerateTestWizard } from '@/context/GenerateTestWizardContext';
import { fetchSubjects, apiSubjectToCourse } from '@/lib/api';

const GAP = 12;
const TILE_WIDTH = 160;
const TILE_HEIGHT = 200;

const DEFAULT_IMAGE = require('@/assets/images/icon.png');

function useSubjectTiles() {
  const { selectedSubjectIds, board, grade, studentName } = useChildSubjects();
  const useBackend = useApi();
  const [apiSubjects, setApiSubjects] = useState<Awaited<ReturnType<typeof fetchSubjects>>>([]);
  const [loading, setLoading] = useState(useBackend);
  useEffect(() => {
    if (!useBackend) return;
    let cancelled = false;
    setLoading(true);
    fetchSubjects(board, grade)
      .then((list) => {
        if (!cancelled) setApiSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setApiSubjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useBackend, board, grade]);

  const tiles = useMemo(() => {
    if (useBackend && apiSubjects.length > 0) {
      const selected = apiSubjects
        .filter((s) => s.is_selected)
        .map((s) => ({ ...apiSubjectToCourse(s, DEFAULT_IMAGE), isSubscribed: s.is_subscribed }));
      if (selected.length > 0) return selected;
    }
    const allForBoardGrade = getCoursesForBoardGrade(board, grade);
    const selected = allForBoardGrade.filter((c) => selectedSubjectIds.includes(c.id));
    if (selected.length > 0) return selected.map((c, i) => ({ ...c, isSubscribed: i === 0 }));
    return allForBoardGrade.map((c, i) => ({ ...c, isSubscribed: i === 0 }));
  }, [useBackend, apiSubjects, selectedSubjectIds, board, grade]);

  return { tiles, studentName, loading };
}

export default function SelectSubjectScreen() {
  const router = useRouter();
  const { setSubject, reset } = useGenerateTestWizard();
  const { addSubject } = useChildSubjects();
  const { tiles, studentName, loading } = useSubjectTiles();
  const [upgradeSubject, setUpgradeSubject] = useState<typeof tiles[0] | null>(null);

  useEffect(() => {
    reset();
  }, [reset]); // Reset wizard when entering so each flow starts fresh.

  const onSelectSubject = (course: typeof tiles[0]) => {
    addSubject(course.id);
    setSubject(course);
    if (course.isSubscribed) {
      router.push('/chapters');
    } else {
      setUpgradeSubject(course);
    }
  };

  const onUpgradeContinue = () => {
    if (upgradeSubject) {
      setSubject(upgradeSubject);
      setUpgradeSubject(null);
      router.push('/chapters');
    }
  };

  const onUpgradeToPremium = () => {
    // Placeholder: payment/checkout (Razorpay) later
    Alert.alert('Coming soon', 'Premium checkout will be available here.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Select Subject</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Choose a subject for {studentName}&apos;s test. Tap to continue.
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.emptyText}>Loading subjects…</Text>
        ) : tiles.length === 0 ? (
          <Text style={styles.emptyText}>No subjects selected. Add subjects from Manage Subjects.</Text>
        ) : (
          <View style={styles.grid}>
            {tiles.map((course) => (
              <TouchableOpacity
                key={course.id}
                style={styles.tileWrap}
                onPress={() => onSelectSubject(course)}
                activeOpacity={0.9}
              >
                <View style={styles.tile}>
                  <Image source={course.image} style={styles.tileBg} contentFit="cover" />
                  <View style={styles.tileScrim} />
                  {!course.isSubscribed && (
                    <View style={styles.premiumBadge}>
                      <Text style={styles.premiumBadgeText}>Free</Text>
                    </View>
                  )}
                  <View style={styles.tileContent}>
                    <Text style={styles.tileBoard}>{course.board} · {course.grade}</Text>
                    <Text style={styles.tileTitle}>{course.title}</Text>
                    <ChevronRight size={20} color="rgba(255,255,255,0.9)" style={styles.chevron} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={upgradeSubject != null} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setUpgradeSubject(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Sparkles size={40} color={Colors.light.tint} strokeWidth={1.5} />
            </View>
            <Text style={styles.modalTitle}>Upgrade to Premium</Text>
            <Text style={styles.modalBody}>
              Get full access to all chapters, unlimited tests, and detailed analytics for {upgradeSubject?.title}.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalPrimary} onPress={onUpgradeToPremium} activeOpacity={0.8}>
                <Text style={styles.modalPrimaryText}>Upgrade to Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondary} onPress={onUpgradeContinue} activeOpacity={0.8}>
                <Text style={styles.modalSecondaryText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  emptyText: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body, marginTop: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tileWrap: { width: TILE_WIDTH },
  tile: {
    width: TILE_WIDTH, height: TILE_HEIGHT, borderRadius: 16, overflow: 'hidden',
    backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border,
  },
  tileBg: { ...StyleSheet.absoluteFillObject },
  tileScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  premiumBadge: {
    position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)',
  },
  premiumBadgeText: { fontSize: 11, color: '#FFF', fontFamily: Fonts.bodySemiBold },
  tileContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, flexDirection: 'row', alignItems: 'center' },
  tileBoard: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.contentBody, marginRight: 6 },
  tileTitle: { flex: 1, fontSize: 14, color: '#FFF', fontFamily: Fonts.contentSemiBold },
  chevron: { marginLeft: 4 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 340, backgroundColor: Colors.light.card, borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: Colors.light.border, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  modalIconWrap: { alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, color: Colors.light.text, fontFamily: Fonts.headingSemiBold, textAlign: 'center', marginBottom: 12 },
  modalBody: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  modalButtons: { gap: 12 },
  modalPrimary: {
    backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
  },
  modalPrimaryText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.headingSemiBold },
  modalSecondary: {
    backgroundColor: 'transparent', paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.light.border,
  },
  modalSecondaryText: { color: Colors.light.tint, fontSize: 16, fontFamily: Fonts.headingSemiBold },
});
