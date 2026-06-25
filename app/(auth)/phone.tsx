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
        recaptchaVerifier.current!
      );

      setPendingVerification(verificationId, formattedPhone);
      setLoginType(loginType === 'business' ? 'business' : 'user');
      console.log('Login type set to:', loginType === 'business' ? 'business' : 'user');

      router.push('/(auth)/verify');
    } catch (err: unknown) {
      console.error('Phone auth error:', err);
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
