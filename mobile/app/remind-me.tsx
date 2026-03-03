import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Bell } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useGenerateTestWizard } from '@/context/GenerateTestWizardContext';

const REMINDERS_KEY = '@rattomatt/scheduled_reminders';

export default function RemindMeScreen() {
  const router = useRouter();
  const { subjectId, subject, selectedChapterIds, selectedTopicIds, testType, reset } = useGenerateTestWizard();
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [saved, setSaved] = useState(false);

  const onDateChange = useCallback((_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate) setDate(selectedDate);
  }, []);

  const onSetReminder = useCallback(async () => {
    const reminder = {
      id: `rem_${Date.now()}`,
      subjectId,
      selectedChapterIds,
      selectedTopicIds,
      testType,
      reminderAt: date.toISOString(),
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = await AsyncStorage.getItem(REMINDERS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push(reminder);
      await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
      setSaved(true);
      reset();
      // Placeholder: schedule local push + in-app reminder (Expo Notifications later).
      setTimeout(() => router.replace('/dashboard'), 1500);
    } catch {
      // ignore
    }
  }, [date, subjectId, selectedChapterIds, selectedTopicIds, testType, reset, router]);

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Remind Me</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {subject?.title ?? 'Test'} – set date and time. You’ll get a push and in-app reminder.
      </Text>

      <View style={styles.iconWrap}>
        <Bell size={40} color={Colors.light.tint} strokeWidth={1.5} />
      </View>

      {Platform.OS === 'android' && (
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
          <Text style={styles.dateBtnText}>{date.toLocaleString()}</Text>
        </TouchableOpacity>
      )}

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={onSetReminder} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>{saved ? 'Reminder set' : 'Set reminder'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Text style={styles.linkBtnText}>Cancel</Text>
      </TouchableOpacity>
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
  iconWrap: { alignItems: 'center', marginBottom: 24 },
  dateBtn: {
    backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 24,
  },
  dateBtnText: { fontSize: 16, color: Colors.light.text, fontFamily: Fonts.body },
  primaryBtn: {
    backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    shadowColor: Colors.light.tint, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.headingSemiBold },
  linkBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  linkBtnText: { fontSize: 14, color: Colors.light.subtext, fontFamily: Fonts.body },
});
