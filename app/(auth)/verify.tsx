import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { OTPInput } from '../../src/components/ui/OTPInput';
import { verifyOTP, getAuthErrorMessage } from '../../src/services/auth';
import { getPendingVerification, clearPendingVerification } from '../../src/services/loginState';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';

const OTP_LENGTH = 6;
const RESEND_TIMER = 60;
const MAX_ATTEMPTS = 3;

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Convert "+972XXXXXXXXX" back to Israeli local format "0XXXXXXXXX" for display.
function formatPhoneForDisplay(phone: string | null): string {
  if (!phone) return '';
  if (phone.startsWith('+972')) return '0' + phone.slice(4);
  return phone;
}

export default function VerifyScreen() {
  const router = useRouter();
  const isMounted = useRef(true);
  const { verificationId, phone } = getPendingVerification();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [timer, setTimer] = useState(RESEND_TIMER);
  const [attempts, setAttempts] = useState(0);
  const verifiedRef = useRef(false);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!verificationId && !verifiedRef.current) {
      router.replace('/(auth)/phone');
    }
  }, [verificationId, router]);

  // Single stable interval - no recreation per tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = useCallback(async () => {
    if (loading || !verificationId || otp.length !== OTP_LENGTH) return;

    if (attempts >= MAX_ATTEMPTS) {
      clearPendingVerification();
      router.replace('/(auth)/phone');
      return;
    }

    setLoading(true);
    setError(false);
    setErrorMessage('');

    try {
      console.log('Verifying OTP with verificationId:', verificationId?.substring(0, 20), 'otp:', otp);
      const verifiedUser = await verifyOTP(verificationId, otp);
      console.log('OTP verified! User:', verifiedUser.uid);
      verifiedRef.current = true;
      clearPendingVerification();
      // AuthContext sets isLoading=true synchronously when onAuthStateChanged fires
      // with a signed-in user, so index.tsx will wait for checkUserStatus to finish
      // before routing — no arbitrary setTimeout workaround needed.
      if (isMounted.current) {
        router.replace('/');
      }
    } catch (err: unknown) {
      console.error('OTP verify error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
      if (!isMounted.current) return;
      const code = (err as { code?: string }).code ?? '';
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(true);
      setErrorMessage(getAuthErrorMessage(code));
      setOtp('');

      if (newAttempts >= MAX_ATTEMPTS) {
        setErrorMessage(he.verify.tooManyAttempts);
        setTimeout(() => {
          if (isMounted.current) {
            clearPendingVerification();
            router.replace('/(auth)/phone');
          }
        }, 1500);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [verificationId, otp, loading, attempts, router]);

  useEffect(() => {
    if (otp.length === OTP_LENGTH && !loading) {
      handleVerify();
    }
  }, [otp, loading, handleVerify]);

  const handleOTPChange = useCallback((value: string) => {
    setOtp(value);
    if (error) {
      setError(false);
      setErrorMessage('');
    }
  }, [error]);

  const handleResend = useCallback(() => {
    if (timer > 0 || loading) return;
    clearPendingVerification();
    router.back();
  }, [timer, loading, router]);

  return (
    <ScreenWrapper>
      <Header onBack={() => { clearPendingVerification(); router.back(); }} />

      <View style={styles.content}>
        <Text style={styles.title}>{he.verify.title}</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.phoneNumber}>{formatPhoneForDisplay(phone)}</Text>
          <TouchableOpacity onPress={handleResend} disabled={timer > 0 || loading}>
            <Text style={[styles.resend, (timer > 0 || loading) && styles.resendDisabled]}>
              {he.verify.subtitle}
              {timer > 0 ? ` ${formatTimer(timer)}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.otpContainer}>
          <OTPInput
            length={OTP_LENGTH}
            value={otp}
            onChange={handleOTPChange}
            error={error}
            disabled={loading}
          />
        </View>

        {error && <Text style={styles.errorText}>{errorMessage}</Text>}
        {attempts > 0 && (
          <Text style={styles.attemptsText}>{`ניסיון ${attempts}/${MAX_ATTEMPTS}`}</Text>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.verify.confirm}
          onPress={handleVerify}
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
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  phoneRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.lg,
  },
  phoneNumber: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  resend: {
    ...typography.captionBold,
    color: colors.text,
    textDecorationLine: 'underline' as const,
  },
  resendDisabled: {
    color: colors.textMuted,
    textDecorationLine: 'none' as const,
  },
  otpContainer: {
    marginTop: 98,
  },
  errorText: {
    ...typography.small,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  attemptsText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  buttonContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
