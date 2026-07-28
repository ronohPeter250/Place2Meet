import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PhoneAuthProvider } from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from '../../src/lib/firebase-recaptcha';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { formatPhoneNumber, validateIsraeliPhone, getAuthErrorMessage } from '../../src/services/auth';
import { setPendingVerification, getPendingVerification, clearPendingVerification, setLoginType } from '../../src/services/loginState';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import app, { auth } from '../../src/config/firebase';

// Re-export for verify.tsx
export { getPendingVerification, clearPendingVerification } from '../../src/services/loginState';

// E2E TEST BUILDS ONLY — see the matching gate in src/config/firebase.ts.
// Phone sign-in needs an ApplicationVerifier. The SDK's own RecaptchaVerifier swaps in
// a mock (which resolves to the literal token 'token') when
// appVerificationDisabledForTesting is set, but it requires a DOM and so cannot run in
// React Native — which is why this app supplies a WebView-based verifier instead. That
// custom verifier knows nothing about the test flag, so it always renders the real
// challenge and an automated run dead-ends on an image CAPTCHA.
// This stub reproduces exactly what the SDK's own mock returns; paired with a phone
// number registered under Auth's "test phone numbers", the backend accepts it and
// returns the preset code without sending an SMS.
// Guarded by a build-time flag that no normal build sets, so this is dead code in any
// shipped APK.
const E2E = process.env.EXPO_PUBLIC_E2E === '1';
const e2eVerifier = {
  type: 'recaptcha',
  verify: async () => {
    console.log('[E2E] verifier.verify() called -> returning mock token');
    return 'token';
  },
  // The SDK only documents `type` + `verify()`, but supply the rest of the
  // RecaptchaVerifier surface as no-ops so any internal call cannot hit undefined.
  render: async () => 0,
  clear: () => {},
  _reset: () => {},
  _destroy: () => {},
};

export default function PhoneScreen() {
  const router = useRouter();
  const { loginType } = useLocalSearchParams<{ loginType?: string }>();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal | null>(null);

  const handlePhoneChange = useCallback((text: string) => {
    setPhone(text);
    setError('');
  }, []);

  const handleContinue = useCallback(async () => {
    if (loading) return;

    const formattedPhone = formatPhoneNumber(phone);

    if (!validateIsraeliPhone(formattedPhone)) {
      setError(he.phone.invalidPhone);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(
        formattedPhone,
        (E2E ? e2eVerifier : recaptchaVerifier.current!) as FirebaseRecaptchaVerifierModal
      );

      setPendingVerification(verificationId, formattedPhone);
      setLoginType(loginType === 'business' ? 'business' : 'user');
      console.log('Login type set to:', loginType === 'business' ? 'business' : 'user');

      router.push('/(auth)/verify');
    } catch (err: unknown) {
      console.error('Phone auth error:', err);
      // A bare message ("undefined is not a function") is not attributable to a line.
      // The stack is what identifies which call actually failed.
      console.error('Phone auth stack:', (err as { stack?: string }).stack ?? '(no stack)');
      const code = (err as { code?: string }).code ?? '';
      setError(getAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }, [phone, loading, router, loginType]);

  return (
    <ScreenWrapper>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={app.options}
        attemptInvisibleVerification
      />

      <Header onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={styles.title}>{he.phone.title}</Text>
        <Text style={styles.subtitle}>{he.phone.subtitle}</Text>

        <View style={styles.inputContainer}>
          <TextField
            value={phone}
            onChangeText={handlePhoneChange}
            placeholder={he.phone.placeholder}
            keyboardType="phone-pad"
            error={error}
            maxLength={15}
            textContentType="telephoneNumber"
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.phone.continue}
          onPress={handleContinue}
          loading={loading}
          disabled={loading}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.massive,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: 32,
  },
  inputContainer: {
    marginTop: 0,
  },
  buttonContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
