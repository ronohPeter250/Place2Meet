import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { AgeRangeSlider } from './AgeRangeSlider';
import { GenderFemaleSmallIcon, GenderMaleSmallIcon, GenderOtherSmallIcon } from './SvgIcons';
import { colors } from '../../theme';
import { he } from '../../i18n/he';
import { Gender } from '../../hooks/useOnboarding';

const genderFilterIcons: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  female: GenderFemaleSmallIcon,
  male: GenderMaleSmallIcon,
  other: GenderOtherSmallIcon,
};

export interface FilterValues {
  genders: Gender[];
  ageRange: [number, number];
  relationshipTypes: ('serious' | 'casual' | 'longTerm')[];
}

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterValues) => void;
  initialValues: FilterValues;
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: he.onboarding.gender.female },
  { value: 'male', label: he.onboarding.gender.male },
  { value: 'other', label: he.onboarding.gender.other },
];

const RELATIONSHIP_TYPES: { value: 'serious' | 'casual' | 'longTerm'; label: string }[] = [
  { value: 'serious', label: he.onboarding.relationshipType.serious },
  { value: 'casual', label: he.onboarding.relationshipType.casual },
  { value: 'longTerm', label: he.onboarding.relationshipType.longTerm },
];

export const FilterModal = React.memo(function FilterModal({
  visible,
  onClose,
  onApply,
  initialValues,
}: FilterModalProps) {
  const insets = useSafeAreaInsets();
  const [genders, setGenders] = useState<Gender[]>(initialValues.genders);
  const [ageRange, setAgeRange] = useState<[number, number]>(initialValues.ageRange);
  const [relationshipTypes, setRelationshipTypes] = useState<('serious' | 'casual' | 'longTerm')[]>(
    initialValues.relationshipTypes
  );

  useEffect(() => {
    if (visible) {
      setGenders(initialValues.genders);
      setAgeRange(initialValues.ageRange);
      setRelationshipTypes(initialValues.relationshipTypes);
    }
  }, [visible, initialValues.genders, initialValues.ageRange, initialValues.relationshipTypes]);

  const toggleGender = useCallback((value: Gender) => {
    setGenders(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }, []);

  const toggleRelType = useCallback((value: 'serious' | 'casual' | 'longTerm') => {
    setRelationshipTypes(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }, []);

  const handleApply = useCallback(() => {
    onApply({ genders, ageRange, relationshipTypes });
    onClose();
  }, [genders, ageRange, relationshipTypes, onApply, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          <Text style={styles.title}>{he.filter.title}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{he.filter.interestedIn}</Text>
            <View style={styles.chipsRow}>
              {GENDERS.map(g => {
                const IconComp = genderFilterIcons[g.value];
                const isSelected = genders.includes(g.value);
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.chip, styles.genderChip, isSelected && styles.chipSelected]}
                    onPress={() => toggleGender(g.value)}
                  >
                    {IconComp && <IconComp size={g.value === 'other' ? 18 : 16} color={isSelected ? colors.primary : colors.text} />}
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.ageHeaderRow}>
              <Text style={styles.ageValues}>{ageRange[0]}-{ageRange[1]}</Text>
              <Text style={styles.sectionTitle}>{he.filter.ageRange}</Text>
            </View>
            <AgeRangeSlider min={18} max={65} value={ageRange} onChange={setAgeRange} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{he.filter.relationshipType}</Text>
            <View style={styles.chipsRow}>
              {RELATIONSHIP_TYPES.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, relationshipTypes.includes(r.value) && styles.chipSelected]}
                  onPress={() => toggleRelType(r.value)}
                >
                  <Text style={[styles.chipText, relationshipTypes.includes(r.value) && styles.chipTextSelected]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.buttons}>
            <Button title={he.filter.apply} onPress={handleApply} variant="primary" style={styles.button} />
            <Button title={he.filter.cancel} onPress={onClose} variant="outline" style={styles.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 24,
    alignItems: 'center',
  },
  handleBar: {
    width: 37,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
  },
  title: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    color: colors.text,
    textAlign: 'right',
  },
  section: {
    width: '100%',
    gap: 16,
  },
  sectionTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  ageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ageValues: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 12,
  },
  chip: {
    width: 81,
    height: 31,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: 'rgba(255,228,14,1)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 18 },
      android: { elevation: 2 },
    }),
  },
  genderChip: {
    width: 75,
  },
  chipSelected: {
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.primary,
  },
  buttons: {
    flexDirection: 'row-reverse',
    gap: 8,
    width: '100%',
    marginTop: 32,
  },
  button: { flex: 1 },
});
