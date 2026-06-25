import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing } from '../../theme';
import { BackArrowIcon } from '../ui/SvgIcons';

interface HeaderProps {
  showBack?: boolean;
  onBack?: () => void;
  title?: string;
  rightElement?: React.ReactNode;
}

export const Header = React.memo(function Header({
  showBack = true,
  onBack,
  title,
  rightElement,
}: HeaderProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }, [onBack, router]);

  return (
    <View style={[styles.container, rightElement ? styles.containerTall : undefined]}>
      <View style={styles.side}>
        {rightElement}
      </View>
      {title && (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      )}
      {showBack && (
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="חזרה"
          accessibilityRole="button"
        >
          <BackArrowIcon />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  containerTall: {
    height: 54,
  },
  side: {
    flex: 1,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
    flex: 2,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
