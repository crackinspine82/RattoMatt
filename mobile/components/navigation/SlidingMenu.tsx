import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Linking, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, HelpCircle, RotateCcw, Settings } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useChildSubjects } from '@/context/ChildSubjectsContext';

const PANEL_WIDTH = Math.min(280, Dimensions.get('window').width * 0.78);
const ANIM_DURATION = 280;

export type SlidingMenuOption = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
};

type SlidingMenuProps = {
  visible: boolean;
  onClose: () => void;
};

export function SlidingMenu({ visible, onClose }: SlidingMenuProps) {
  const router = useRouter();
  const setChildSubjects = useChildSubjects().setChildSubjects;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateX = useRef(new Animated.Value(PANEL_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslateX, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslateX, {
          toValue: PANEL_WIDTH,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, panelTranslateX]);

  const handleManageSubjects = () => {
    onClose();
    router.push('/subject-config');
  };

  const handleNeedSupport = () => {
    onClose();
    Linking.openURL('mailto:support@rattomatt.com').catch(() => {});
  };

  const handleResetToDefaults = () => {
    setChildSubjects({ board: 'ICSE', grade: 'Grade 9', studentName: 'Arjun', selectedSubjectIds: [] });
    onClose();
    router.replace('/dashboard');
  };

  const options: SlidingMenuOption[] = [
    {
      id: 'manage-subjects',
      label: 'Manage Subjects',
      icon: <Settings size={20} color={Colors.light.text} strokeWidth={2} />,
      onPress: handleManageSubjects,
    },
    {
      id: 'reset-defaults',
      label: 'Reset to defaults (Grade 9)',
      icon: <RotateCcw size={20} color={Colors.light.text} strokeWidth={2} />,
      onPress: handleResetToDefaults,
    },
    {
      id: 'need-support',
      label: 'Need Support?',
      icon: <HelpCircle size={20} color={Colors.light.text} strokeWidth={2} />,
      onPress: handleNeedSupport,
    },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { width: PANEL_WIDTH, transform: [{ translateX: panelTranslateX }] }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Menu</Text>
        </View>
        <View style={styles.list}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={opt.onPress}
            >
              {opt.icon != null ? <View style={styles.rowIcon}>{opt.icon}</View> : null}
              <Text style={styles.rowLabel} numberOfLines={1}>{opt.label}</Text>
              <ChevronRight size={20} color={Colors.light.subtext} />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.light.background,
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
    zIndex: 1,
  },
  panelHeader: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  panelTitle: {
    fontSize: 20,
    fontFamily: Fonts.headingSemiBold,
    color: Colors.light.text,
  },
  list: {
    marginTop: 8,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: Fonts.body,
  },
});
