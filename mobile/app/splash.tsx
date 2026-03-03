import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export default function SplashScreen() {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const holdTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => router.replace('/auth'));
    }, 2500);

    return () => clearTimeout(holdTimer);
  }, [opacity, router]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>R</Text>
      </View>
      <Text style={styles.title}>RattoMatt</Text>
      <Text style={styles.subtitle}>Smart revision for real exams</Text>
      <View style={styles.loader} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: Fonts.headingBold,
  },
  title: {
    marginTop: 16,
    fontSize: 24,
    color: Colors.light.text,
    fontFamily: Fonts.headingSemiBold,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.subtext,
    fontFamily: Fonts.body,
  },
  loader: {
    marginTop: 20,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.light.border,
    borderTopColor: Colors.light.tint,
  },
});
