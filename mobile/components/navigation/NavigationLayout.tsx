import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { BottomNav } from './BottomNav';
import { SlidingMenu } from './SlidingMenu';
import { TopBar } from './TopBar';

const TOKENS = {
  background: '#FFFFFF',
};

const HEADER_HEIGHT = 60;

type NavKey = 'home' | 'papers' | 'create' | 'progress' | 'menu';

export type ScrollDirection = 'up' | 'down' | null;

type NavigationLayoutProps = {
  children: React.ReactNode;
  activeTab?: NavKey;
  onTabPress?: (key: NavKey) => void;
  onOpenProfileMenu?: () => void;
  onPressNotifications?: () => void;
  studentName?: string;
  hasUnreadNotifications?: boolean;
  scrollDirection?: ScrollDirection;
  menuOpen?: boolean;
  onMenuClose?: () => void;
};

export function NavigationLayout({
  children,
  activeTab = 'home',
  onTabPress,
  onOpenProfileMenu,
  onPressNotifications,
  studentName,
  hasUnreadNotifications = false,
  scrollDirection = null,
  menuOpen = false,
  onMenuClose,
}: NavigationLayoutProps) {
  const headerTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const visible = hasUnreadNotifications || scrollDirection !== 'down';
    Animated.timing(headerTranslateY, {
      toValue: visible ? 0 : -HEADER_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [hasUnreadNotifications, scrollDirection, headerTranslateY]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.headerWrap, { transform: [{ translateY: headerTranslateY }] }]}>
        <TopBar
          studentName={studentName}
          hasUnreadNotifications={hasUnreadNotifications}
          onOpenProfileMenu={onOpenProfileMenu}
          onPressNotifications={onPressNotifications}
        />
      </Animated.View>
      <View style={styles.content}>{children}</View>
      <BottomNav active={activeTab} onPress={onTabPress} />
      {onMenuClose != null && (
        <View style={styles.menuWrap} pointerEvents={menuOpen ? 'box-none' : 'none'}>
          <SlidingMenu visible={menuOpen} onClose={onMenuClose} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TOKENS.background,
  },
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingTop: HEADER_HEIGHT,
    paddingHorizontal: 20,
  },
  menuWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
});
