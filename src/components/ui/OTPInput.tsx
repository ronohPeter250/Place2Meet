import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { colors, borderRadius, spacing } from '../../theme';

interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}

export const OTPInput = React.memo(function OTPInput({
  length,
  value,
  onChange,
  error = false,
  disabled = false,
}: OTPInputProps) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handlePress = useCallback(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, length);
    onChange(cleaned);
  }, [length, onChange]);

  const digits = useMemo(() => value.split(''), [value]);
  const indices = useMemo(() => Array.from({ length }, (_, i) => i), [length]);

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        style={styles.hiddenInput}
        autoFocus={!disabled}
        editable={!disabled}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        importantForAccessibility="no"
        accessible={false}
      />
      <View style={styles.boxes}>
        {indices.map((i) => {
          const isFilled = i < digits.length;
          const isCurrent = i === digits.length;

          return (
            <View
              key={i}
              style={[
                styles.box,
                isFilled && styles.boxFilled,
                isCurrent && styles.boxActive,
                error && isFilled && styles.boxError,
              ]}
            >
              {isFilled && (
                <Text style={[styles.digit, error && styles.digitError]}>
                  {digits[i]}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  boxes: {
    // Numeric OTP must read left-to-right even in an RTL app; row-reverse
    // rendered the first digit rightmost, so the code appeared reversed.
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  box: {
    width: 40,
    height: 50,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: colors.primary,
  },
  boxActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  boxError: {
    borderColor: colors.error,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  digit: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  digitError: {
    color: colors.error,
  },
});
