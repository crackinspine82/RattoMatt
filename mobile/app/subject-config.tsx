import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Plus, Settings2, X } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/constants/api';
import { getCoursesForBoardGrade } from '@/constants/courses';
import { useChildSubjects } from '@/context/ChildSubjectsContext';
import { fetchSubjects, apiSubjectToCourse } from '@/lib/api';

const GAP = 12;
const TILE_WIDTH = 160;
const TILE_HEIGHT = 220;

const DEFAULT_IMAGE = require('@/assets/images/icon.png');

export default function SubjectConfigScreen() {
  const router = useRouter();
  const { selectedSubjectIds, board, grade, studentName, addSubject, removeSubject } = useChildSubjects();
  const useBackend = useApi();
  const [apiSubjects, setApiSubjects] = useState<Awaited<ReturnType<typeof fetchSubjects>>>([]);
  const [loading, setLoading] = useState(useBackend);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadSubjects = React.useCallback(() => {
    if (!useBackend) return;
    setLoading(true);
    setApiError(null);
    fetchSubjects(board, grade)
      .then((list) => {
        setApiSubjects(list);
      })
      .catch((err) => {
        setApiSubjects([]);
        setApiError(err instanceof Error ? err.message : 'Failed to load subjects');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [useBackend, board, grade]);

  useEffect(() => {
    if (!useBackend) return;
    loadSubjects();
  }, [useBackend, loadSubjects]);

  const available = useMemo(() => {
    if (useBackend && apiSubjects.length > 0) return apiSubjects.map((s) => apiSubjectToCourse(s, DEFAULT_IMAGE));
    return getCoursesForBoardGrade(board, grade);
  }, [useBackend, apiSubjects, board, grade]);

  const selectedCourses = useMemo(
    () => available.filter((c) => selectedSubjectIds.includes(c.id)),
    [available, selectedSubjectIds]
  );
  const notSelected = useMemo(
    () => available.filter((c) => !selectedSubjectIds.includes(c.id)),
    [available, selectedSubjectIds]
  );

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Manage {studentName}{"'"}s Subjects</Text>
        <TouchableOpacity
          style={styles.backBtnCircle}
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.8}
        >
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Add or remove subjects. Tap Configure to choose which chapters, topics and micro-topics to include.</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {selectedCourses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Current subjects</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {selectedCourses.map((course) => (
                <View key={course.id} style={styles.tileWrap}>
                  <SubjectTileReadOnly
                    title={course.title}
                    board={course.board}
                    grade={course.grade}
                    author={course.author}
                    description={course.description}
                    image={course.image}
                  />
                  <TouchableOpacity
                    style={styles.configureBtn}
                    onPress={() => router.push({ pathname: '/chapters-config', params: { subjectId: course.id, title: course.title } })}
                    hitSlop={12}
                  >
                    <Settings2 size={18} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.configureBtnText}>Configure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeSubject(course.id)}
                    hitSlop={12}
                  >
                    <X size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {notSelected.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Add subject</Text>
            <View style={styles.grid}>
              {notSelected.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  style={styles.tileWrapGrid}
                  onPress={() => addSubject(course.id)}
                  activeOpacity={0.9}
                >
                  <SubjectTileReadOnly
                    title={course.title}
                    board={course.board}
                    grade={course.grade}
                    author={course.author}
                    description={course.description}
                    image={course.image}
                  />
                  <View style={styles.addOverlay}>
                    <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.addOverlayText}>Add</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {apiError && (
          <View style={styles.apiErrorBlock}>
            <Text style={styles.apiErrorText}>Couldn't reach the server. Using saved subjects if any.</Text>
            <Text style={styles.apiErrorHint}>Start the backend (e.g. npm run dev in backend/) and set EXPO_PUBLIC_API_URL in mobile/.env.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadSubjects} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {loading && (
          <Text style={styles.emptyText}>Loading subjects…</Text>
        )}
        {!loading && !apiError && selectedCourses.length === 0 && notSelected.length === 0 && (
          <Text style={styles.emptyText}>No subjects available for this board and grade.</Text>
        )}

        <Link href="/dashboard" asChild>
          <TouchableOpacity style={styles.doneButton} activeOpacity={0.8}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </View>
  );
}

function SubjectTileReadOnly({
  title,
  board,
  grade,
  author,
  description,
  image,
}: {
  title: string;
  board: string;
  grade: string;
  author: string;
  description: string;
  image: number;
}) {
  return (
    <View style={styles.tile}>
      <Image source={image} style={styles.tileBgImage} contentFit="cover" />
      <View style={styles.tileScrim} />
      <View style={styles.tileContent}>
        <Text style={styles.tileBoard}>{board} · {grade}</Text>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileAuthor}>{author}</Text>
        <Text style={styles.tileDescription} numberOfLines={2}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pageTitle: {
    flex: 1,
    fontSize: 28,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  backBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.card,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
    marginBottom: 24,
  },
  scroll: { flex: 1 },
  wrap: { paddingBottom: 32 },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 20,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tileWrap: {
    width: TILE_WIDTH,
    position: 'relative',
  },
  tileWrapGrid: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    position: 'relative',
  },
  configureBtn: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(110, 98, 229, 0.9)',
  },
  configureBtnText: {
    fontSize: 12,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFFFFF',
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tileBgImage: { ...StyleSheet.absoluteFillObject },
  tileScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  tileContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 12,
  },
  tileBoard: {
    fontSize: 11,
    fontFamily: Fonts.contentBody,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
  },
  tileTitle: {
    fontSize: 14,
    fontFamily: Fonts.contentSemiBold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tileAuthor: {
    fontSize: 12,
    fontFamily: Fonts.contentBody,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  tileDescription: {
    fontSize: 12,
    fontFamily: Fonts.contentBody,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
    marginBottom: 8,
  },
  addOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(110, 98, 229, 0.7)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  addOverlayText: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFFFFF',
  },
  apiErrorBlock: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  apiErrorText: {
    fontSize: 14,
    color: Colors.light.text,
    fontFamily: Fonts.bodySemiBold,
  },
  apiErrorHint: {
    fontSize: 13,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFF',
  },
  emptyText: {
    marginTop: 24,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  doneButton: {
    marginTop: 32,
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.headingSemiBold,
  },
});
