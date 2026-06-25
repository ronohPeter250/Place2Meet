import { useCallback } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Button } from '../../src/components/ui/Button';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  const handleLoginPhone = useCallback(() => router.push({ pathname: '/(auth)/phone', params: { loginType: 'user' } }), [router]);
  const handleLoginBusiness = useCallback(() => router.push({ pathname: '/(auth)/phone', params: { loginType: 'business' } }), [router]);

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.content}>
        {/* Logo from Figma */}
        <Image
          source={require('../../assets/images/logo_place2meet.png')}
          style={styles.logo}
          resizeMode="contain"
          fadeDuration={0}
        />

        {/* Radar Illustration - full image from Figma export */}
        <Image
          source={require('../../assets/images/radar_full.png')}
          style={styles.radarImage}
          resizeMode="contain"
          fadeDuration={0}
        />

        {/* Welcome Text with gradient title */}
        <View style={styles.textContainer}>
          <MaskedView
            maskElement={<Text style={styles.title}>{he.welcome.title}</Text>}
          >
            <LinearGradient
              colors={[colors.white, colors.primary]}
              locations={[0.093, 0.699]}
              start={{ x: 0, y: 0.27 }}
              end={{ x: 1, y: 0.73 }}
            >
              <Text style={[styles.title, { opacity: 0 }]}>{he.welcome.title}</Text>
            </LinearGradient>
          </MaskedView>
          <Text style={styles.subtitle}>{he.welcome.subtitle}</Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        <Button
          title={he.welcome.loginPhone}
          onPress={handleLoginPhone}
          variant="primary"
          style={styles.button}
        />
        <Button
          title={he.welcome.loginBusiness}
          onPress={handleLoginBusiness}
          variant="outline"
          style={styles.button}
        />

        <Text style={styles.terms}>
          {he.welcome.terms}{' '}
          <Text style={styles.termsLink}>{he.welcome.termsLink}</Text>
          {' '}{he.welcome.and}{' '}
          <Text style={styles.privacyLink}>{he.welcome.privacyLink}</Text>
        </Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  logo: {
    width: 185,
    height: 31,
    marginTop: 12,
    marginBottom: 0,
  },
  // Radar - single exported image from Figma
  radarImage: {
    width: SCREEN_WIDTH * 1.07,
    height: SCREEN_WIDTH * 1.07,
    marginBottom: 0,
  },
  // Welcome text - Figma: gap 24px
  textContainer: {
    alignItems: 'center',
    marginTop: -20,
    marginBottom: 12,
    gap: 24,
  },
  title: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 28,
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.28,
  },
  subtitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 18,
    color: colors.white,
    textAlign: 'center',
  },
  buttonsContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
    paddingTop: 44,
    gap: 16,
  },
  button: {
    width: '100%',
  },
  terms: {
    ...typography.caption,
    color: colors.white,
    textAlign: 'center',
  },
  termsLink: {
    fontFamily: 'Rubik_600SemiBold',
    color: colors.white,
    textDecorationLine: 'underline' as const,
  },
  privacyLink: {
    fontFamily: 'Rubik_700Bold',
    color: colors.white,
    textDecorationLine: 'underline' as const,
  },
});
