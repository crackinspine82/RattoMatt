import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';

const TOKENS = {
  background: '#F6F8FD',
  textDark: '#2D303E',
  textGrey: '#A0A3BD',
  white: '#FFFFFF',
};

type TopBarProps = {
  studentName?: string;
  hasUnreadNotifications?: boolean;
  onOpenProfileMenu?: () => void;
  onPressNotifications?: () => void;
};

export function TopBar({
  studentName = 'Arjun',
  hasUnreadNotifications = false,
  onOpenProfileMenu,
  onPressNotifications,
}: TopBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.dropdown} onPress={onOpenProfileMenu} activeOpacity={0.8}>
        <Text style={styles.studentLabel}>{studentName}'s Studyboard ▾</Text>
      </TouchableOpacity>

      <View style={styles.right}>
        <TouchableOpacity style={styles.iconButton} onPress={onPressNotifications} activeOpacity={0.8}>
          <View>
            <Bell size={22} color={TOKENS.textDark} />
            {hasUnreadNotifications && <View style={styles.unreadDot} />}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdown: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  studentLabel: {
    color: TOKENS.textDark,
    fontSize: 18,
    fontFamily: Fonts.headingSemiBold,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    padding: 6,
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
  },
});
