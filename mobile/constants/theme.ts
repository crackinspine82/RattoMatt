/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#6E62E5';
const tintColorDark = '#FFFFFF';

export const Colors = {
  light: {
    text: '#2D303E',
    background: '#FFFFFF',
    tint: tintColorLight,
    icon: '#A0A3BD',
    tabIconDefault: '#A0A3BD',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    subtext: '#6E7191',
    border: '#EFF0F6',
    success: '#3DD598',
    warning: '#FFC542',
    error: '#FF575F',
    info: '#007AFF',
    gradientStart: '#6E62E5',
    gradientEnd: '#9F83F1',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

const fontMap = Platform.select({
  ios: {
    headingBold: 'Montserrat_700Bold',
    headingSemiBold: 'Montserrat_600SemiBold',
    body: 'Lato_400Regular',
    bodySemiBold: 'Lato_600SemiBold',
    bodyBold: 'Lato_700Bold',
    sans: 'Lato_400Regular',
    serif: 'ui-serif',
    rounded: 'Montserrat_600SemiBold',
    mono: 'ui-monospace',
  },
  default: {
    headingBold: 'Montserrat_700Bold',
    headingSemiBold: 'Montserrat_600SemiBold',
    body: 'Lato_400Regular',
    bodySemiBold: 'Lato_600SemiBold',
    bodyBold: 'Lato_700Bold',
    sans: 'Lato_400Regular',
    serif: 'serif',
    rounded: 'Montserrat_600SemiBold',
    mono: 'monospace',
  },
  web: {
    headingBold: 'Montserrat_700Bold',
    headingSemiBold: 'Montserrat_600SemiBold',
    body: 'Lato_400Regular',
    bodySemiBold: 'Lato_600SemiBold',
    bodyBold: 'Lato_700Bold',
    sans: 'Lato_400Regular',
    serif: 'serif',
    rounded: 'Montserrat_600SemiBold',
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/** Lato font for content fetched from the backend (subjects, chapters, topics). */
export const Fonts = {
  ...fontMap,
  contentBody: fontMap!.body,
  contentSemiBold: fontMap!.bodySemiBold,
};
