import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Dimensions, NativeSyntheticEvent, NativeScrollEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { NavigationLayout, type ScrollDirection } from '@/components/navigation/NavigationLayout';
import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/constants/api';
import { getCoursesForBoardGrade } from '@/constants/courses';
import { useChildSubjects } from '@/context/ChildSubjectsContext';
import { fetchSubjects, apiSubjectToCourse } from '@/lib/api';

const PARENT_NAME = 'Anil';
const SCROLL_DIR_THRESHOLD = 8;

// Mock: replace with real notification state from API/context.
const HAS_UNREAD_NOTIFICATIONS = false;

const CONTAINER_PADDING = 48;
const CAROUSEL_HEIGHT = 380;
const AUTO_SCROLL_INTERVAL_MS = 4500;

const HERO_TILES = [
  { id: 'generate-test', title: 'Generate New Test', description: "Create a fresh paper from your syllabus and take it when you're ready.", href: '/paper-select', image: require('@/assets/images/generate-test.png') },
  { id: 'study-notes', title: 'Generate Study Notes', description: 'Quick revision notes from your syllabus and textbook.', href: '/paper-select', image: require('@/assets/images/study-notes.png') },
  { id: 'submit-scores', title: 'Submit Past Scores', description: "Grade pending papers and update your child's progress.", href: '/pending-papers', image: require('@/assets/images/submit-scores.png') },
  { id: 'rapidfire', title: 'Take RapidFire Test', description: 'Quick timed practice in student mode. No login needed.', href: '/student-mode', image: require('@/assets/images/rapidfire.png') },
  { id: 'progress', title: "Student's Progress", description: 'View mastery snapshot and recent activity.', href: '/dashboard', image: require('@/assets/images/progress.png') },
] as const;

const DEFAULT_IMAGE = require('@/assets/images/icon.png');

function useSubjectTiles() {
  const { selectedSubjectIds, board, grade, studentName } = useChildSubjects();
  const useBackend = useApi();
  const [apiSubjects, setApiSubjects] = useState<Awaited<ReturnType<typeof fetchSubjects>>>([]);

  useEffect(() => {
    if (!useBackend) return;
    let cancelled = false;
    fetchSubjects(board, grade)
      .then((list) => {
        if (!cancelled) setApiSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setApiSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [useBackend, board, grade]);

  const tiles = useMemo(() => {
    if (useBackend) {
      return apiSubjects
        .filter((s) => selectedSubjectIds.includes(s.id))
        .map((s) => ({ ...apiSubjectToCourse(s, DEFAULT_IMAGE), isSubscribed: s.is_subscribed }));
    }
    const allForBoardGrade = getCoursesForBoardGrade(board, grade);
    return allForBoardGrade
      .filter((c) => selectedSubjectIds.includes(c.id))
      .map((c, i) => ({ ...c, isSubscribed: i === 0 }));
  }, [useBackend, apiSubjects, selectedSubjectIds, board, grade]);

  return { tiles, studentName };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_SLIDE_WIDTH = SCREEN_WIDTH;

export default function DashboardScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { tiles: subjectTiles, studentName } = useSubjectTiles();

  const onVerticalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollY.current;
    if (Math.abs(delta) >= SCROLL_DIR_THRESHOLD) {
      setScrollDirection(delta > 0 ? 'down' : 'up');
      lastScrollY.current = y;
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % HERO_TILES.length;
        scrollRef.current?.scrollTo({ x: next * CAROUSEL_SLIDE_WIDTH, animated: true });
        return next;
      });
    }, AUTO_SCROLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CAROUSEL_SLIDE_WIDTH);
    if (index >= 0 && index < HERO_TILES.length) setActiveIndex(index);
  };

  return (
    <NavigationLayout
      activeTab="home"
      onTabPress={(key) => {
        if (key === 'home') return;
        if (key === 'create') {
          router.push('/paper-select');
          return;
        }
        if (key === 'menu') {
          setMenuOpen(true);
          return;
        }
      }}
      studentName={studentName}
      hasUnreadNotifications={HAS_UNREAD_NOTIFICATIONS}
      scrollDirection={scrollDirection}
      menuOpen={menuOpen}
      onMenuClose={() => setMenuOpen(false)}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        onScroll={onVerticalScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Hi, {PARENT_NAME}</Text>
          <Text style={styles.subtext}>What would you like today?</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          style={styles.tilesScroll}
          contentContainerStyle={styles.tilesContent}
          showsHorizontalScrollIndicator={false}
          pagingEnabled={false}
          snapToInterval={CAROUSEL_SLIDE_WIDTH}
          snapToAlignment="start"
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}
        >
          {HERO_TILES.map((tile) => (
            <View key={tile.id} style={[styles.heroSlide, { width: CAROUSEL_SLIDE_WIDTH }]}>
              <HeroTile title={tile.title} description={tile.description} href={tile.href} image={tile.image} />
            </View>
          ))}
        </ScrollView>

        <View style={styles.subjectsSectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleNoMargin]}>{studentName}{"'"}s Subjects</Text>
          <Link href="/subject-config" asChild>
            <TouchableOpacity hitSlop={8}>
              <Text style={styles.manageSubjectsLink}>Manage Subjects</Text>
            </TouchableOpacity>
          </Link>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectsRow}>
          {subjectTiles.length === 0 ? (
            <View style={styles.emptySubjects}>
              <Text style={styles.emptySubjectsText}>No subjects selected.</Text>
              <Link href="/subject-config" asChild>
                <TouchableOpacity style={styles.emptySubjectsLink}>
                  <Text style={styles.emptySubjectsLinkText}>Add subjects</Text>
                </TouchableOpacity>
              </Link>
            </View>
          ) : (
            subjectTiles.map((s) => (
              <SubjectTile
                key={s.id}
                title={s.title}
                board={s.board}
                grade={s.grade}
                author={s.author}
                description={s.description}
                image={s.image}
                isSubscribed={s.isSubscribed}
              />
            ))
          )}
        </ScrollView>

        <SectionHeader title="Mastery Snapshot" />
        <View style={styles.masteryCard}>
          <MasteryChip label="History" value="62%" />
          <MasteryChip label="Civics" value="55%" />
          <MasteryChip label="Geography" value="--" muted />
        </View>

        <View style={styles.footerSpacer} />
      </ScrollView>
    </NavigationLayout>
  );
}

function SectionHeader({ title, href }: { title: string; href?: Href }) {
  const text = <Text style={styles.sectionTitle}>{title}</Text>;
  if (href) {
    return (
      <Link href={href} asChild>
        <TouchableOpacity style={styles.sectionHeaderLink}>{text}</TouchableOpacity>
      </Link>
    );
  }
  return text;
}

function HeroTile({
  title,
  description,
  href,
  image,
}: {
  title: string;
  description: string;
  href: Href;
  image: number;
}) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.heroTile} activeOpacity={0.9}>
        <Text style={styles.heroTileTitle}>{title}</Text>
        <Image source={image} style={styles.heroTileImage} contentFit="contain" />
        <Text style={styles.heroTileDescription}>{description}</Text>
      </TouchableOpacity>
    </Link>
  );
}

function SubjectTile({
  title,
  board,
  grade,
  author,
  description,
  image,
  isSubscribed,
}: {
  title: string;
  board: string;
  grade: string;
  author: string;
  description: string;
  image: number;
  isSubscribed: boolean;
}) {
  return (
    <View style={styles.subjectTile}>
      <Image source={image} style={styles.subjectTileBgImage} contentFit="cover" />
      <View style={styles.subjectTileScrim} />
      {!isSubscribed && (
        <View style={styles.upgradeTag}>
          <Text style={styles.upgradeTagText}>Upgrade to Premium</Text>
        </View>
      )}
      <View style={styles.subjectTileContent}>
        <Text style={styles.subjectTileBoard}>{board} · {grade}</Text>
        <Text style={styles.subjectTileTitle}>{title}</Text>
        <Text style={styles.subjectTileAuthor}>{author}</Text>
        <Text style={styles.subjectTileDescription} numberOfLines={2}>{description}</Text>
      </View>
    </View>
  );
}

function MasteryChip({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={[styles.masteryChip, muted && styles.masteryMuted]}>
      <Text style={styles.masteryLabel}>{label}</Text>
      <Text style={styles.masteryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 120,
  },
  header: {
    marginTop: 16,
  },
  greeting: {
    fontSize: 28,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  subtext: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  tilesScroll: {
    marginTop: 20,
    marginHorizontal: -24,
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  tilesContent: {
    flexDirection: 'row',
  },
  heroSlide: {
    width: CAROUSEL_SLIDE_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  heroTile: {
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  heroTileTitle: {
    fontSize: 20,
    fontFamily: Fonts.headingSemiBold,
    color: Colors.light.text,
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  heroTileImage: {
    width: '100%',
    height: 260,
    marginBottom: 10,
  },
  heroTileDescription: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.light.subtext,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 20,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  subjectsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitleNoMargin: {
    marginTop: 0,
    marginBottom: 0,
  },
  manageSubjectsLink: {
    fontSize: 14,
    color: Colors.light.tint,
    fontFamily: Fonts.headingSemiBold,
  },
  sectionHeaderLink: {
    alignSelf: 'flex-start',
  },
  emptySubjects: {
    paddingVertical: 16,
    paddingRight: 24,
    gap: 8,
  },
  emptySubjectsText: {
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  emptySubjectsLink: {
    alignSelf: 'flex-start',
  },
  emptySubjectsLinkText: {
    fontSize: 14,
    color: Colors.light.tint,
    fontFamily: Fonts.headingSemiBold,
  },
  subjectsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 24,
    paddingBottom: 8,
  },
  subjectTile: {
    width: 160,
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  subjectTileBgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  subjectTileScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  subjectTileContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 12,
  },
  subjectTileBoard: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
  },
  subjectTileTitle: {
    fontSize: 14,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subjectTileAuthor: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  subjectTileDescription: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
    marginBottom: 8,
  },
  upgradeTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: '#cb5238',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  upgradeTagText: {
    fontSize: 10,
    fontFamily: Fonts.headingSemiBold,
    color: '#FFFFFF',
  },
  masteryCard: {
    flexDirection: 'row',
    gap: 12,
  },
  masteryChip: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  masteryMuted: {
    opacity: 0.6,
  },
  masteryLabel: {
    fontSize: 12,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  masteryValue: {
    marginTop: 4,
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  footerSpacer: {
    height: 24,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
