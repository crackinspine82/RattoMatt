import React from 'react';
import { Link, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';

import { Screen } from '@/components/screen';
import { Colors, Fonts } from '@/constants/theme';

export default function MenuScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
        <ArrowLeft size={22} color={Colors.light.text} strokeWidth={2} />
      </TouchableOpacity>
      <Screen title="Menu" subtitle="Settings and options.">
      <View style={styles.list}>
        <Link href="/subject-config" asChild>
          <TouchableOpacity style={styles.row} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Manage Subjects</Text>
            <ChevronRight size={20} color={Colors.light.subtext} />
          </TouchableOpacity>
        </Link>
      </View>
    </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  list: {
    marginTop: 8,
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: Fonts.body,
  },
});
