import React, { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { Screen } from '@/components/screen';
import { Colors, Fonts } from '@/constants/theme';
import { getCoursesForBoardGrade } from '@/constants/courses';
import { useChildSubjects } from '@/context/ChildSubjectsContext';

const DEFAULT_STUDENT_NAME = 'Arjun';
const DEFAULT_BOARD = 'ICSE';
const DEFAULT_GRADE = 'Grade 10';

const GAP = 12;
const TILE_WIDTH = 160;
const TILE_HEIGHT = 220;

export default function SubjectPickerScreen() {
  const router = useRouter();
  const { setSelectedSubjectIds, setBoard, setGrade, setStudentName } = useChildSubjects();
  const params = useLocalSearchParams<{ board?: string; grade?: string; studentName?: string }>();
  const board = params.board ?? DEFAULT_BOARD;
  const grade = params.grade ?? DEFAULT_GRADE;
  const studentName = params.studentName ?? DEFAULT_STUDENT_NAME;

  const coursesToShow = useMemo(() => getCoursesForBoardGrade(board, grade), [board, grade]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onContinue = () => {
    setBoard(board);
    setGrade(grade);
    setStudentName(studentName);
    setSelectedSubjectIds(Array.from(selectedIds));
    router.push('/syllabus');
  };

  return (
    <Screen
      title={`Select ${studentName}'s Subjects`}
      subtitle="Default selection for your child. You can change, add or remove later."
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.gridWrap}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {coursesToShow.map((course) => (
            <SubjectPickerTile
              key={course.id}
              id={course.id}
              title={course.title}
              board={course.board}
              grade={course.grade}
              author={course.author}
              description={course.description}
              image={course.image}
              selected={selectedIds.has(course.id)}
              onPress={() => toggle(course.id)}
            />
          ))}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.continueButton} onPress={onContinue} activeOpacity={0.8}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </Screen>
  );
}

function SubjectPickerTile({
  title,
  board,
  grade,
  author,
  description,
  image,
  selected,
  onPress,
}: {
  id: string;
  title: string;
  board: string;
  grade: string;
  author: string;
  description: string;
  image: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.9}>
      <Image source={image} style={styles.tileBgImage} contentFit="cover" />
      <View style={styles.tileScrim} />
      {selected && (
        <View style={styles.checkWrap}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
      <View style={styles.tileContent}>
        <Text style={styles.tileBoard}>{board} · {grade}</Text>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileAuthor}>{author}</Text>
        <Text style={styles.tileDescription} numberOfLines={2}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  gridWrap: {
    paddingBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
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
  tileBgImage: {
    ...StyleSheet.absoluteFillObject,
  },
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
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
  },
  tileTitle: {
    fontSize: 14,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tileAuthor: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  tileDescription: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
    marginBottom: 8,
  },
  checkWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.headingSemiBold,
  },
});
