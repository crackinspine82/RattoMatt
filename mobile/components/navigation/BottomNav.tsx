import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BookCopy, ClipboardPlus, Home, Menu, ShieldEllipsis } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';

/** Max finger movement (px) and max press duration (ms) for menu tap — avoids opening on slide. */
const MENU_TAP_MAX_DISTANCE = 20;
const MENU_TAP_MAX_DURATION_MS = 400;

const TOKENS = {
  background: '#F6F8FD',
  primary: '#6E62E5',
  primaryGradientStart: '#6E62E5',
  primaryGradientEnd: '#9F83F1',
  textDark: '#2D303E',
  textGrey: '#A0A3BD',
  white: '#FFFFFF',
};

type NavKey = 'home' | 'papers' | 'create' | 'progress' | 'menu';

type BottomNavProps = {
  active?: NavKey;
  onPress?: (key: NavKey) => void;
};

export function BottomNav({ active = 'home', onPress }: BottomNavProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <NavItem
          label="Home"
          active={active === 'home'}
          onPress={() => onPress?.('home')}
          icon={<Home size={22} color={active === 'home' ? TOKENS.primary : TOKENS.textGrey} />}
        />
        <NavItem
          label="Papers"
          active={active === 'papers'}
          onPress={() => onPress?.('papers')}
          icon={<BookCopy size={22} color={active === 'papers' ? TOKENS.primary : TOKENS.textGrey} />}
        />

        <View style={styles.fabSlot}>
          <TouchableOpacity style={styles.fabTouchable} onPress={() => onPress?.('create')} activeOpacity={0.9}>
            <LinearGradient
              colors={[TOKENS.primaryGradientStart, TOKENS.primaryGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <ClipboardPlus size={26} color={TOKENS.white} />
            </LinearGradient>
            <Text style={[styles.label, styles.fabLabel]}>Create</Text>
          </TouchableOpacity>
        </View>

        <NavItem
          label="Progress"
          active={active === 'progress'}
          onPress={() => onPress?.('progress')}
          icon={<ShieldEllipsis size={22} color={active === 'progress' ? TOKENS.primary : TOKENS.textGrey} />}
        />
        <MenuNavItem
          label="Menu"
          active={active === 'menu'}
          onPress={() => onPress?.('menu')}
          icon={<Menu size={22} color={active === 'menu' ? TOKENS.primary : TOKENS.textGrey} />}
        />
      </View>
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.8}>
      {icon}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Menu item: opens only on tap (Gesture.Tap), not on slide, so swiping the screen doesn't open the menu. */
function MenuNavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(MENU_TAP_MAX_DISTANCE)
        .maxDuration(MENU_TAP_MAX_DURATION_MS)
        .onEnd(() => {
          onPress?.();
        })
        .runOnJS(true),
    [onPress]
  );

  return (
    <GestureDetector gesture={tapGesture}>
      <View style={styles.navItem} collapsable={false}>
        {icon}
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: TOKENS.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 6,
  },
  navItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 44,
  },
  label: {
    fontSize: 12,
    color: TOKENS.textGrey,
    fontFamily: Fonts.headingSemiBold,
  },
  labelActive: {
    color: TOKENS.primary,
    fontFamily: Fonts.headingSemiBold,
  },
  fabSlot: {
    width: 64,
    alignItems: 'center',
    marginTop: -38,
    zIndex: 20,
    elevation: 20,
  },
  fabTouchable: {
    alignItems: 'center',
    gap: 6,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  fabLabel: {
    color: TOKENS.primary,
  },
});
