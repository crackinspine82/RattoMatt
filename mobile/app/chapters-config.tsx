import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { ArrowLeft, ChevronDown, ChevronRight, Check } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/constants/api';
import { getChaptersForSubject } from '@/constants/syllabus';
import type { Chapter } from '@/constants/syllabus';
import { useSubjectConfig, type SubjectSelection } from '@/context/SubjectConfigContext';
import { fetchChapters } from '@/lib/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function allSelectionFromChapters(chapters: Chapter[]): SubjectSelection {
  const chapterIds = chapters.map((ch) => ch.id);
  const topicIds = chapters.flatMap((ch) => ch.topics.map((t) => t.id));
  const microTopicIds = chapters.flatMap((ch) =>
    ch.topics.flatMap((t) => (t.micro_topics ?? []).map((m) => m.id))
  );
  return { chapterIds, topicIds, microTopicIds };
}

function useChapterSelectionConfig(
  subjectId: string,
  chapters: Chapter[],
  selection: SubjectSelection,
  setSelection: (s: SubjectSelection) => void,
  setConfig: (subjectId: string, s: SubjectSelection) => void
) {
  const persist = useCallback(
    (next: SubjectSelection) => {
      setSelection(next);
      setConfig(subjectId, next);
    },
    [subjectId, setConfig]
  );

  const { chapterIds: selectedChapterIds, topicIds: selectedTopicIds, microTopicIds: selectedMicroTopicIds } = selection;

  const toggleChapter = useCallback(
    (chapter: Chapter) => {
      const topicIds = chapter.topics.map((t) => t.id);
      const microIds = chapter.topics.flatMap((t) => (t.micro_topics ?? []).map((m) => m.id));
      const allTopicsSelected = topicIds.every((id) => selectedTopicIds.includes(id));
      const allMicroSelected = microIds.length === 0 || microIds.every((id) => selectedMicroTopicIds.includes(id));
      const allSelected = allTopicsSelected && allMicroSelected;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (allSelected) {
        persist({
          chapterIds: selectedChapterIds.filter((id) => id !== chapter.id),
          topicIds: selectedTopicIds.filter((id) => !topicIds.includes(id)),
          microTopicIds: selectedMicroTopicIds.filter((id) => !microIds.includes(id)),
        });
      } else {
        persist({
          chapterIds: [...new Set([...selectedChapterIds, chapter.id])],
          topicIds: [...new Set([...selectedTopicIds, ...topicIds])],
          microTopicIds: [...new Set([...selectedMicroTopicIds, ...microIds])],
        });
      }
    },
    [selectedChapterIds, selectedTopicIds, selectedMicroTopicIds, persist]
  );

  const toggleTopic = useCallback(
    (topicId: string, chapterId: string) => {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (!chapter) return;
      const topic = chapter.topics.find((t) => t.id === topicId);
      const microIds = topic ? (topic.micro_topics ?? []).map((m) => m.id) : [];
      const isSelecting = !selectedTopicIds.includes(topicId);
      const newTopicIds = isSelecting ? [...selectedTopicIds, topicId] : selectedTopicIds.filter((id) => id !== topicId);
      const newMicroIds = isSelecting
        ? [...new Set([...selectedMicroTopicIds, ...microIds])]
        : selectedMicroTopicIds.filter((id) => !microIds.includes(id));
      const isTopicSelected = (t: (typeof chapter.topics)[0]) =>
        t.micro_topics?.length
          ? (t.micro_topics ?? []).every((m) => newMicroIds.includes(m.id))
          : newTopicIds.includes(t.id);
      const allSelectedInChapter = chapter.topics.every(isTopicSelected);
      const newChapterIds = allSelectedInChapter ? [...new Set([...selectedChapterIds, chapterId])] : selectedChapterIds.filter((id) => id !== chapterId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      persist({ chapterIds: newChapterIds, topicIds: newTopicIds, microTopicIds: newMicroIds });
    },
    [chapters, selectedChapterIds, selectedTopicIds, selectedMicroTopicIds, persist]
  );

  const toggleMicroTopic = useCallback(
    (microTopicId: string, topicId: string, chapterId: string) => {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (!chapter) return;
      const topic = chapter.topics.find((t) => t.id === topicId);
      const microIds = topic ? (topic.micro_topics ?? []).map((m) => m.id) : [];
      const newMicroIds = selectedMicroTopicIds.includes(microTopicId)
        ? selectedMicroTopicIds.filter((id) => id !== microTopicId)
        : [...selectedMicroTopicIds, microTopicId];
      const allMicroSelectedInTopic = microIds.every((id) => newMicroIds.includes(id));
      const newTopicIds = allMicroSelectedInTopic ? [...new Set([...selectedTopicIds, topicId])] : selectedTopicIds.filter((id) => id !== topicId);
      const topicIds = chapter.topics.map((t) => t.id);
      const allTopicsSelected = topicIds.every((id) => newTopicIds.includes(id));
      const allMicroInChapter = chapter.topics.flatMap((t) => (t.micro_topics ?? []).map((m) => m.id));
      const allMicroSelected = allMicroInChapter.length === 0 || allMicroInChapter.every((id) => newMicroIds.includes(id));
      const newChapterIds = allTopicsSelected && allMicroSelected ? [...new Set([...selectedChapterIds, chapterId])] : selectedChapterIds.filter((id) => id !== chapterId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      persist({ chapterIds: newChapterIds, topicIds: newTopicIds, microTopicIds: newMicroIds });
    },
    [chapters, selectedChapterIds, selectedTopicIds, selectedMicroTopicIds, persist]
  );

  const totalCount = useMemo(
    () =>
      chapters.reduce(
        (acc, ch) =>
          acc + ch.topics.reduce((a, t) => a + (t.micro_topics?.length ? t.micro_topics.length : 1), 0),
        0
      ),
    [chapters]
  );
  const selectedCount = useMemo(
    () =>
      chapters.reduce(
        (acc, ch) =>
          acc +
          ch.topics.reduce((a, t) => {
            if (t.micro_topics?.length) {
              return a + (t.micro_topics ?? []).filter((m) => selectedMicroTopicIds.includes(m.id)).length;
            }
            return a + (selectedTopicIds.includes(t.id) ? 1 : 0);
          }, 0),
        0
      ),
    [chapters, selectedTopicIds, selectedMicroTopicIds]
  );

  return { toggleChapter, toggleTopic, toggleMicroTopic, selectedCount, totalCount };
}

function isTopicSelected(
  topic: Chapter['topics'][0],
  selectedTopicIds: string[],
  selectedMicroTopicIds: string[]
): boolean {
  if (topic.micro_topics?.length) {
    return (topic.micro_topics ?? []).every((m) => selectedMicroTopicIds.includes(m.id));
  }
  return selectedTopicIds.includes(topic.id);
}

function ChapterRowConfig({
  chapter,
  expanded,
  onToggleExpand,
  selectedChapterIds,
  selectedTopicIds,
  selectedMicroTopicIds,
  onToggleChapter,
  onToggleTopic,
  onToggleMicroTopic,
}: {
  chapter: Chapter;
  expanded: boolean;
  onToggleExpand: () => void;
  selectedChapterIds: string[];
  selectedTopicIds: string[];
  selectedMicroTopicIds: string[];
  onToggleChapter: (ch: Chapter) => void;
  onToggleTopic: (topicId: string, chapterId: string) => void;
  onToggleMicroTopic: (microTopicId: string, topicId: string, chapterId: string) => void;
}) {
  const chapterSelected = selectedChapterIds.includes(chapter.id);
  const allTopicsSelected = chapter.topics.every((t) =>
    isTopicSelected(t, selectedTopicIds, selectedMicroTopicIds)
  );

  return (
    <View style={styles.chapterWrap}>
      <TouchableOpacity style={styles.chapterRow} onPress={onToggleExpand} activeOpacity={0.8}>
        <View style={styles.chapterLeft}>
          {expanded ? <ChevronDown size={20} color={Colors.light.text} /> : <ChevronRight size={20} color={Colors.light.text} />}
          <TouchableOpacity
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation();
              onToggleChapter(chapter);
            }}
            style={styles.checkWrap}
          >
            {chapterSelected || allTopicsSelected ? (
              <View style={styles.checkboxChecked}>
                <Check size={14} color="#FFF" strokeWidth={3} />
              </View>
            ) : (
              <View style={styles.checkbox} />
            )}
          </TouchableOpacity>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {chapter.sequence_number != null ? `${chapter.sequence_number}. ` : ''}{chapter.title}
          </Text>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.topicsWrap}>
          {chapter.topics.map((topic) => {
            const topicSelected = isTopicSelected(topic, selectedTopicIds, selectedMicroTopicIds);
            const hasMicro = (topic.micro_topics?.length ?? 0) > 0;
            return (
              <View key={topic.id}>
                <TouchableOpacity
                  style={styles.topicRow}
                  onPress={() => onToggleTopic(topic.id, chapter.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.topicLeft}>
                    {topicSelected ? (
                      <View style={[styles.checkboxChecked, styles.checkboxSmall]}>
                        <Check size={12} color="#FFF" strokeWidth={3} />
                      </View>
                    ) : (
                      <View style={[styles.checkbox, styles.checkboxSmall]} />
                    )}
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                  </View>
                </TouchableOpacity>
                {hasMicro && (
                  <View style={styles.microWrap}>
                    {(topic.micro_topics ?? []).map((micro) => (
                      <TouchableOpacity
                        key={micro.id}
                        style={styles.microRow}
                        onPress={() => onToggleMicroTopic(micro.id, topic.id, chapter.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.topicLeft}>
                          {selectedMicroTopicIds.includes(micro.id) ? (
                            <View style={[styles.checkboxChecked, styles.checkboxSmall]}>
                              <Check size={12} color="#FFF" strokeWidth={3} />
                            </View>
                          ) : (
                            <View style={[styles.checkbox, styles.checkboxSmall]} />
                          )}
                          <Text style={styles.microTitle}>{micro.title}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
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
  emptyText: { marginTop: 24, fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
  chapterWrap: { marginBottom: 8, backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border, overflow: 'hidden' },
  chapterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  chapterLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chapterTitle: { flex: 1, fontSize: 16, color: Colors.light.text, fontFamily: Fonts.contentSemiBold },
  checkWrap: { padding: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.light.border },
  checkboxSmall: { width: 18, height: 18, borderRadius: 4 },
  checkboxChecked: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.light.tint, alignItems: 'center', justifyContent: 'center' },
  topicsWrap: { paddingLeft: 48, paddingRight: 16, paddingBottom: 12 },
  topicRow: { paddingVertical: 10, paddingLeft: 8 },
  topicLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicTitle: { fontSize: 14, color: Colors.light.text, fontFamily: Fonts.contentBody },
  microWrap: { paddingLeft: 24, paddingBottom: 4 },
  microRow: { paddingVertical: 6, paddingLeft: 8 },
  microTitle: { fontSize: 13, color: Colors.light.subtext, fontFamily: Fonts.contentBody },
  footer: { marginTop: 24, gap: 12 },
  countText: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
  doneBtn: {
    backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    shadowColor: Colors.light.tint, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  doneBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.headingSemiBold },
});

export default function ChaptersConfigScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId: string; title?: string }>();
  const subjectId = params.subjectId ?? '';
  const subjectTitle = params.title ?? 'Subject';
  const { getConfig, setConfig } = useSubjectConfig();
  const [selection, setSelection] = useState<SubjectSelection>({ chapterIds: [], topicIds: [], microTopicIds: [] });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const useBackend = useApi();
  const [apiChapters, setApiChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string | null>(null);

  useEffect(() => {
    if (!useBackend || !subjectId) return;
    let cancelled = false;
    setApiChapters([]);
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
  }, [useBackend, subjectId]);

  const chapters = useMemo(() => {
    if (!subjectId) return [];
    if (useBackend) return apiChapters;
    return getChaptersForSubject(subjectId);
  }, [subjectId, useBackend, apiChapters]);

  // Initialize selection from stored config or "all" once chapters are loaded
  const prevSubjectId = useRef<string | null>(null);
  useEffect(() => {
    if (chapters.length === 0) return;
    if (prevSubjectId.current !== subjectId) {
      prevSubjectId.current = subjectId;
      const stored = getConfig(subjectId);
      if (stored) {
        setSelection(stored);
      } else {
        const all = allSelectionFromChapters(chapters);
        setSelection(all);
        setConfig(subjectId, all);
      }
    }
  }, [chapters, subjectId, getConfig, setConfig]);

  const { toggleChapter, toggleTopic, toggleMicroTopic, selectedCount, totalCount } = useChapterSelectionConfig(
    subjectId,
    chapters,
    selection,
    setSelection,
    setConfig
  );

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!subjectId) {
    return (
      <View style={styles.root}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>No subject specified. Go back.</Text>
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
        <Text style={styles.pageTitle}>Subject configuration</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {subjectTitle} – choose chapters, topics and micro-topics to include.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {chapters.map((chapter) => (
          <ChapterRowConfig
            key={chapter.id}
            chapter={chapter}
            expanded={expandedId === chapter.id}
            onToggleExpand={() => toggleExpand(chapter.id)}
            selectedChapterIds={selection.chapterIds}
            selectedTopicIds={selection.topicIds}
            selectedMicroTopicIds={selection.microTopicIds}
            onToggleChapter={toggleChapter}
            onToggleTopic={toggleTopic}
            onToggleMicroTopic={toggleMicroTopic}
          />
        ))}
        <View style={styles.footer}>
          <Text style={styles.countText}>
            {selectedCount} of {totalCount} items selected
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
