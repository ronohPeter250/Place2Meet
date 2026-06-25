import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { colors, typography, borderRadius, spacing } from '../../theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const TextField = React.memo(function TextField({ label, error, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback((e: any) => {
    setFocused(true);
    onFocus?.(e);
  }, [onFocus]);

  const handleBlur = useCallback((e: any) => {
    setFocused(false);
    onBlur?.(e);
  }, [onBlur]);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  input: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
    textAlign: 'right',
    height: 48,
    textAlignVertical: 'center',
  },
  inputFocused: {
    borderColor: colors.white,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    ...typography.small,
    color: colors.error,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
});
