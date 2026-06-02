import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { AccountStatus } from '../types';
import { accountStatusLabel, getEffectiveAccountStatus } from '../utils';
import { colors, typography } from '../../theme';

export function AdminCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function AdminTextInput(props: TextInputProps & { label: string }) {
  const { label, style, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...inputProps}
        style={[styles.input, style]}
      />
    </View>
  );
}

export function AdminSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.selectRow}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.selectOption, selected && styles.selectOptionSelected]}
            >
              <Text style={[styles.selectText, selected && styles.selectTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function StatusBadge({ status }: { status?: AccountStatus }) {
  const effective = getEffectiveAccountStatus(status);
  return (
    <View style={[styles.badge, badgeStyle[effective]]}>
      <Text style={styles.badgeText}>{accountStatusLabel(effective)}</Text>
    </View>
  );
}

export function AdminButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, styles[`${variant}Button`], style, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const badgeStyle = StyleSheet.create({
  active: { backgroundColor: 'rgba(76, 175, 80, 0.25)' },
  suspended: { backgroundColor: 'rgba(255, 193, 7, 0.25)' },
  blocked: { backgroundColor: 'rgba(255, 112, 67, 0.25)' },
  deleted: { backgroundColor: 'rgba(255, 0, 0, 0.25)' },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'right',
  },
  field: {
    gap: 8,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: 14,
    textAlign: 'right',
  },
  selectRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectText: {
    color: colors.textSecondary,
  },
  selectTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: colors.text,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceLight,
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  disabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
  },
});
