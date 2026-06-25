import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
}

export const StatCard = React.memo(function StatCard({
  title,
  value,
  subtitle,
  accentColor = colors.primary,
}: StatCardProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#23201E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#393635',
    padding: 12,
    flexDirection: 'row-reverse',
    gap: 8,
    minHeight: 88,
  },
  accentBar: {
    width: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-end',
  },
  value: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 24,
    color: colors.white,
    textAlign: 'right',
  },
  title: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: '#A7A7A7',
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 10,
    color: '#666666',
    textAlign: 'right',
  },
});
