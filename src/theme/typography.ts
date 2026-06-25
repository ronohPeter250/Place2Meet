import { TextStyle } from 'react-native';

export const typography = {
  h1: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 28,
    lineHeight: 34,
  },
  h2: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  h3: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 22,
  },
  bodyBold: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
  },
  caption: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  captionBold: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
  },
  small: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
  },
  input: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 18,
    lineHeight: 24,
  },
} satisfies Record<string, TextStyle>;
