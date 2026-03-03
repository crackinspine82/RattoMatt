import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { ArrowLeft, Check } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/constants/api';
import { getChaptersForSubject } from '@/constants/syllabus';
import type { Chapter } from '@/constants/syllabus';
import { useGenerateTestWizard } from '@/context/GenerateTestWizardContext';
import { fetchChapters, isSubjectIdFromApi } from '@/lib/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function useChapterOnlySelection(chapters: Chapter[]) {
  const { selectedChapterIds, setChapterTopicMicroSelection } = useGenerateTestWizard();

  const toggleChapter = useCallback(
    (chapter: Chapter) => {
      const isSelected = selectedChapterIds.includes(chapter.id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (isSelected) {
        setChapterTopicMicroSelection(
          selectedChapterIds.filter((id) => id !== chapter.id),
          [],
          []
        );
      } else {
        setChapterTopicMicroSelection(
          [...selectedChapterIds, chapter.id],
          [],
          []
        );
      }
    },
    [selectedChapterIds, setChapterTopicMicroSelection]
  );

  const selectAll = useCallback(() => {
    const allIds = chapters.map((ch) => ch.id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChapterTopicMicroSelection(allIds, [], []);
  }, [chapters, setChapterTopicMicroSelection]);

  const clearAll = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChapterTopicMicroSelection([], [], []);
  }, [setChapterTopicMicroSelection]);

  const selectedCount = selectedChapterIds.length;
  const totalCount = chapters.length;

  return { toggleChapter, selectAll, clearAll, selectedCount, totalCount };
}

export default function ChaptersScreen() {
  const router = useRouter();
  const { subjectId, subject, selectedChapterIds } = useGenerateTestWizard();
  const useBackend = useApi();
  const [apiChapters, setApiChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string | null>(null);

  const useChaptersApi = useBackend && subjectId != null && isSubjectIdFromApi(subjectId);

  useEffect(() => {
    if (!useChaptersApi || !subjectId) return;
    let cancelled = false;
    setChaptersLoading(true);
    setChaptersError(null);
    fetchChapters(subjectId)
      .then((list) => {
        if (!cancelled) setApiChapters(list as Chapter[]);
      })
      .catch((err) => {
        if (!cancelled) setChaptersError(err instanceof Error ? err.message : 'Failed to load chapters');
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useChaptersApi, subjectId]);

  const chapters = useMemo(() => {
    if (!subjectId) return [];
    if (useChaptersApi) return apiChapters;
    return getChaptersForSubject(subjectId);
  }, [subjectId, useChaptersApi, apiChapters]);

  const { toggleChapter, selectAll, clearAll, selectedCount, totalCount } = useChapterOnlySelection(chapters);

  const onContinue = () => {
    router.push('/test-type');
  };

  if (!subjectId || !subject) {
    return (
      <View style={styles.root}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>No subject selected. Go back and choose a subject.</Text>
      </View>
    );
  }

  if (chaptersLoading) {
    return (
      <View style={styles.root}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>Loading chapters…</Text>
      </View>
    );
  }

  if (chaptersError) {
    return (
      <View style={styles.root}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>{chaptersError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Select chapters</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {subject.title} – choose chapters for this test.
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.linkBtn} onPress={selectAll} activeOpacity={0.7}>
          <Text style={styles.linkBtnText}>Select all</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={clearAll} activeOpacity={0.7}>
          <Text style={styles.linkBtnText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {chapters.map((chapter) => {
          const selected = selectedChapterIds.includes(chapter.id);
          return (
            <TouchableOpacity
              key={chapter.id}
              style={styles.chapterRow}
              onPress={() => toggleChapter(chapter)}
              activeOpacity={0.7}
            >
              <View style={styles.chapterLeft}>
                {selected ? (
                  <View style={styles.checkboxChecked}>
                    <Check size={14} color="#FFF" strokeWidth={3} />
                  </View>
                ) : (
                  <View style={styles.checkbox} />
                )}
                <Text style={styles.chapterTitle} numberOfLines={2}>
                  {chapter.sequence_number != null ? `${chapter.sequence_number}. ` : ''}{chapter.title}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={styles.footer}>
          <Text style={styles.countText}>
            {selectedCount} of {totalCount} chapters selected
          </Text>
          <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
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
  subtitle: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body, marginBottom: 16 },
  actionsRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  linkBtn: { paddingVertical: 4 },
  linkBtnText: { fontSize: 14, color: Colors.light.tint, fontFamily: Fonts.bodySemiBold },
  scroll: { flex: 1 },
  wrap: { paddingBottom: 32 },
  emptyText: { marginTop: 24, fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chapterLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.light.border },
  checkboxChecked: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.light.tint, alignItems: 'center', justifyContent: 'center' },
  chapterTitle: { flex: 1, fontSize: 16, color: Colors.light.text, fontFamily: Fonts.contentSemiBold },
  footer: { marginTop: 24, gap: 12 },
  countText: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
  continueBtn: {
    backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    shadowColor: Colors.light.tint, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  continueBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.headingSemiBold },
});
