import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { DonutChart } from '../../src/components/ui/DonutChart';
import { getDashboardStats, DashboardStats, DashboardPeriod } from '../../src/services/dashboard';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors } from '../../src/theme';
import { he } from '../../src/i18n/he';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string; title: string }[] = [
  { value: 'daily', label: 'יומי', title: 'averageDaily' },
  { value: 'weekly', label: 'שבועי', title: 'averageWeekly' },
  { value: 'monthly', label: 'חודשי', title: 'averageMonthly' },
  { value: 'yearly', label: 'שנתי', title: 'averageYearly' },
];

export default function DashboardScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<DashboardPeriod>('daily');
  const [showDropdown, setShowDropdown] = useState(false);
  const currentOption = PERIOD_OPTIONS.find(o => o.value === period)!;
  const periodLabel = currentOption.label;
  const cardTitleText = he.dashboard[currentOption.title as keyof typeof he.dashboard];
  const { width: screenWidth } = useWindowDimensions();
  // Figma base: card content width = 343-32(padding) = 311, donut = 238
  const cardContentWidth = screenWidth - 32 - 32; // screen - mainPadding - cardPadding
  const donutSize = Math.round(cardContentWidth * (238 / 311));
  const chartHeight = Math.round(cardContentWidth * (330 / 311));

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const data = await getDashboardStats(user.uid, period);
          if (!cancelled) setStats(data);
        } catch (err) {
          console.error('[DashboardScreen] stats fetch failed:', err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [user, period]),
  );

  const handlePeriodChange = useCallback((newPeriod: DashboardPeriod) => {
    setShowDropdown(false);
    setPeriod(newPeriod);
  }, []);

  const chartSegments = useMemo(() => {
    if (!stats || (stats.malePercent === 0 && stats.femalePercent === 0 && stats.otherPercent === 0)) {
      return [{ percent: 100, color: colors.surfaceLight }];
    }
    return [
      { percent: stats.malePercent, color: '#FF7043' },
      { percent: stats.femalePercent, color: '#FFD043' },
      { percent: stats.otherPercent, color: '#D4D4D4' },
    ];
  }, [stats]);

  return (
    <ScreenWrapper>
      {/* Title — Figma: x:286, y:86, Rubik 700 22px */}
      <View style={styles.header}>
        <Text style={styles.title}>{he.dashboard.title}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.mainContainer}>
          {/* Daily Average Card — Figma: #23201E, stroke #393635, borderRadius 24 */}
          <View style={styles.card}>
            {/* Header Row */}
            <View style={styles.cardHeaderRow}>
              {/* Dropdown Pill + Menu — left side */}
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity style={styles.dropdownPill} onPress={() => setShowDropdown(!showDropdown)} activeOpacity={0.7}>
                  <Text style={styles.dropdownArrow}>{'\u25BC'}</Text>
                  <Text style={styles.dropdownText}>{periodLabel}</Text>
                </TouchableOpacity>
                {showDropdown && (
                  <View style={styles.dropdownMenu}>
                    {PERIOD_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.dropdownOption, period === opt.value && styles.dropdownOptionActive]}
                        onPress={() => handlePeriodChange(opt.value)}
                      >
                        <Text style={[styles.dropdownOptionText, period === opt.value && styles.dropdownOptionTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              {/* Title + Date — right side */}
              <View style={styles.cardTitleCol}>
                <Text style={styles.cardTitle}>{cardTitleText}</Text>
                <Text style={styles.cardDate}>{stats?.date}</Text>
              </View>
            </View>

            {/* Donut Chart — responsive, Figma ratio: 238/311 donut, 330/311 height */}
            <View style={{ height: chartHeight, alignItems: 'center', position: 'relative' }}>
              <DonutChart
                size={donutSize}
                strokeWidth={Math.round(donutSize * (24 / 238))}
                segments={chartSegments}
                centerValue={stats?.dailyAverage ?? 0}
              />
              {/* Floating % pills — Figma: x/311, y/330 ratios */}
              <View style={[styles.percentPill, { right: Math.round(cardContentWidth * 0.03), top: Math.round(chartHeight * 0.37) }]}>
                <View style={[styles.percentDot, { backgroundColor: '#FF7043' }]} />
                <Text style={styles.percentText}>{stats?.malePercent ?? 0}%</Text>
              </View>
              <View style={[styles.percentPill, { left: Math.round(cardContentWidth * 0.19), top: Math.round(chartHeight * 0.07) }]}>
                <View style={[styles.percentDot, { backgroundColor: '#FFD043' }]} />
                <Text style={styles.percentText}>{stats?.femalePercent ?? 0}%</Text>
              </View>
              <View style={[styles.percentPill, { left: Math.round(cardContentWidth * 0.12), top: Math.round(chartHeight * 0.56) }]}>
                <View style={[styles.percentDot, { backgroundColor: '#D4D4D4' }]} />
                <Text style={styles.percentText}>{stats?.otherPercent ?? 0}%</Text>
              </View>
            </View>

            {/* Categories Legend — Figma: row space-between, width 311 */}
            <View style={styles.categoriesRow}>
              <View style={styles.categoryItem}>
                <View style={styles.categoryTextCol}>
                  <Text style={styles.categoryTitle}>{he.map.other}</Text>
                  <Text style={styles.categorySubtitle}>משתמשים</Text>
                </View>
                <View style={[styles.categoryBar, { backgroundColor: '#D4D4D4' }]} />
              </View>
              <View style={styles.categoryItem}>
                <View style={styles.categoryTextCol}>
                  <Text style={styles.categoryTitle}>{he.map.women}</Text>
                  <Text style={styles.categorySubtitle}>משתמשים</Text>
                </View>
                <View style={[styles.categoryBar, { backgroundColor: '#FFD043' }]} />
              </View>
              <View style={styles.categoryItem}>
                <View style={styles.categoryTextCol}>
                  <Text style={styles.categoryTitle}>{he.map.men}</Text>
                  <Text style={styles.categorySubtitle}>משתמשים</Text>
                </View>
                <View style={[styles.categoryBar, { backgroundColor: '#FF7043' }]} />
              </View>
            </View>
          </View>
        </View>
      )}
      {/* Dismiss overlay when dropdown is open */}
      {showDropdown && (
        <TouchableOpacity style={styles.dismissOverlay} activeOpacity={1} onPress={() => setShowDropdown(false)} />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    color: colors.white,
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Main Container — Figma: x:16, y:144, width:343, column gap:8 */
  mainContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  /* Card — Figma: bg #23201E, stroke #393635 1px, borderRadius 24, padding 16, column gap 16 */
  card: {
    backgroundColor: '#23201E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#393635',
    padding: 16,
    gap: 16,
  },
  /* Header Row — Figma: row space-between center */
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  /* Title column — Figma: column gap 8, width 178 */
  cardTitleCol: {
    gap: 8,
  },
  /* "ממוצע משתמשים יומי" — Rubik 600, 16px, right, white */
  cardTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.white,
    textAlign: 'right',
  },
  /* Date — Rubik 400, 14px, right, #A7A7A7 */
  cardDate: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: '#A7A7A7',
    textAlign: 'right',
  },
  /* Dropdown pill — Figma: width 93, row center, gap 4, padding 8, white stroke, shadow, borderRadius 32 */
  dropdownPill: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    width: 93,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  /* "יומי" — Rubik 400, 14px, center, white */
  dropdownText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.white,
    textAlign: 'center',
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.white,
  },
  /* Floating % pills — Figma: row center, gap 4, padding 6px 8px 6px 6px, bg white, shadow, borderRadius 32 */
  percentPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: 32,
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 6,
    elevation: 4,
    shadowColor: 'rgba(160,160,160,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  /* Dot — 6x6 circle */
  percentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  /* % text — Rubik 400, 12px, center, black */
  percentText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: '#000000',
  },
  /* Categories Row — Figma: row space-between, at y:278 in chart container */
  categoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  /* Category Item — Figma: row center, gap 6 */
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /* Text column — Figma: column, gap 2 */
  categoryTextCol: {
    gap: 2,
  },
  /* Title — Rubik 400, 14px, right, white, width 80 */
  categoryTitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.white,
    textAlign: 'right',
    width: 80,
  },
  /* Subtitle — Rubik 400, 10px, right, #A7A7A7 */
  categorySubtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 10,
    color: '#A7A7A7',
    textAlign: 'right',
  },
  /* Color bar — 4x36, borderRadius 2 */
  categoryBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  /* Anchored Dropdown */
  dropdownWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    backgroundColor: '#23201E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#393635',
    paddingVertical: 4,
    width: 93,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 20,
  },
  dropdownOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownOptionActive: {
    backgroundColor: 'rgba(255,112,67,0.15)',
  },
  dropdownOptionText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.white,
    textAlign: 'center',
  },
  dropdownOptionTextActive: {
    color: '#FF7043',
    fontFamily: 'Rubik_600SemiBold',
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
