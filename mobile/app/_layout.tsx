import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { ChildSubjectsProvider } from '@/context/ChildSubjectsContext';
import { GenerateTestWizardProvider } from '@/context/GenerateTestWizardContext';
import { SubjectConfigProvider } from '@/context/SubjectConfigContext';
import { Fonts } from '@/constants/theme';
import { Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { Lato_400Regular, Lato_600SemiBold, Lato_700Bold } from '@expo-google-fonts/lato';

const defaultBodyFont = Fonts?.body ?? 'Lato_400Regular';

if (Text.defaultProps == null) {
  Text.defaultProps = {};
}
Text.defaultProps.style = [{ fontFamily: defaultBodyFont }, Text.defaultProps.style];

if (TextInput.defaultProps == null) {
  TextInput.defaultProps = {};
}
TextInput.defaultProps.style = [{ fontFamily: defaultBodyFont }, TextInput.defaultProps.style];

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Lato_400Regular,
    Lato_600SemiBold,
    Lato_700Bold,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      SplashScreen.preventAutoHideAsync();
    }
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && Platform.OS !== 'web') {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
    <ThemeProvider value={DefaultTheme}>
      <ChildSubjectsProvider>
        <SubjectConfigProvider>
        <GenerateTestWizardProvider>
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
          <Stack.Screen name="index" />
        <Stack.Screen name="splash" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="parent-name" />
        <Stack.Screen name="child-name" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="school" />
        <Stack.Screen name="subject-picker" />
        <Stack.Screen name="subject-config" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="syllabus" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="paper-select" />
        <Stack.Screen name="chapters" />
        <Stack.Screen name="chapters-config" />
        <Stack.Screen name="test-type" />
        <Stack.Screen name="paper-config" />
        <Stack.Screen name="paper-preview" />
        <Stack.Screen name="take-test" />
        <Stack.Screen name="remind-me" />
        <Stack.Screen name="grading" />
        <Stack.Screen name="pending-papers" />
        <Stack.Screen name="student-mode" />
        <Stack.Screen name="rapidfire" />
        <Stack.Screen name="flashcards" />
        <Stack.Screen name="admin-upload" />
        </Stack>
        </GenerateTestWizardProvider>
        </SubjectConfigProvider>
      </ChildSubjectsProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
});
