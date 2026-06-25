import { useEffect, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { AdminButton, AdminCard } from '../../src/admin/components/AdminControls';
import { AdminShell } from '../../src/admin/components/AdminShell';
import { useAdminAuth } from '../../src/admin/AdminAuthContext';
import { AdminPlatformOverview, getPlatformOverviewForAdmin } from '../../src/admin/services';
import { adminErrorMessage } from '../../src/admin/utils';
import { BarChart } from '../../src/components/ui/BarChart';
import { DonutChart } from '../../src/components/ui/DonutChart';
import { colors, typography } from '../../src/theme';

export default function AdminOverviewScreen() {
  const { admin } = useAdminAuth();
  const [data, setData] = useState<AdminPlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  const load = async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await getPlatformOverviewForAdmin();
      setData(overview);
    } catch (err) {
      setError(adminErrorMessage(err, 'טעינת הנתונים נכשלה'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [admin]);

  const onChartLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== chartWidth) setChartWidth(width);
  };

  const gender = data?.genderBreakdown;
  const hasGender = !!gender && gender.male + gender.female + gender.other > 0;
  const genderSegments = hasGender
    ? [
        { percent: gender!.malePercent, color: '#FF7043' },
        { percent: gender!.femalePercent, color: '#FFD043' },
        { percent: gender!.otherPercent, color: '#D4D4D4' },
      ]
    : [{ percent: 100, color: colors.surfaceLight }];

  const events = data?.eventsBreakdown;
  const attendanceRate =
    events && events.totalCapacity > 0
      ? Math.round((events.totalAttendees / events.totalCapacity) * 100)
      : 0;

  return (
    <AdminShell title="סטטיסטיקות ופילוח הנתונים">
      <View style={styles.actions}>
        <AdminButton
          title={loading ? 'טוען...' : 'רענון'}
          onPress={load}
          disabled={loading}
          variant="secondary"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : data ? (
        <>
          {/* Top-level totals */}
          <View style={styles.statsRow}>
            <StatCard label={'סה"כ משתמשים'} value={data.totalUsers} />
            <StatCard label={'סה"כ עסקים'} value={data.totalBusinesses} />
            <StatCard label={'סה"כ אירועים'} value={data.totalEvents} />
            <StatCard label={'סה"כ צ׳ק-אינים'} value={data.totalCheckins} />
          </View>

          {/* Gender breakdown — all users */}
          <AdminCard title="פילוח מגדרי — כלל המשתמשים">
            <View style={styles.donutWrap}>
              <DonutChart
                size={220}
                strokeWidth={26}
                segments={genderSegments}
                centerValue={data.totalUsers}
              />
            </View>
            <View style={styles.legendRow}>
              <LegendItem color="#FF7043" label="גברים" value={gender?.male ?? 0} percent={gender?.malePercent ?? 0} />
              <LegendItem color="#FFD043" label="נשים" value={gender?.female ?? 0} percent={gender?.femalePercent ?? 0} />
              <LegendItem color="#D4D4D4" label="אחר" value={gender?.other ?? 0} percent={gender?.otherPercent ?? 0} />
            </View>
          </AdminCard>

          {/* Age distribution */}
          <AdminCard title="התפלגות גילאים">
            <View onLayout={onChartLayout}>
              {chartWidth > 0 ? (
                <BarChart
                  width={chartWidth}
                  data={data.ageDistribution.map(group => ({
                    label: group.label,
                    value: group.count,
                    color: group.color,
                  }))}
                />
              ) : null}
            </View>
          </AdminCard>

          {/* Weekly check-in activity */}
          <AdminCard title="פעילות צ׳ק-אין שבועית (7 ימים אחרונים)">
            <View onLayout={onChartLayout}>
              {chartWidth > 0 ? (
                <BarChart
                  width={chartWidth}
                  data={data.weeklyActivity.map(day => ({
                    label: day.label,
                    value: day.count,
                    color: day.color,
                  }))}
                />
              ) : null}
            </View>
          </AdminCard>

          {/* Events summary */}
          <AdminCard title="סיכום אירועים">
            <View style={styles.eventRows}>
              <EventStat label="אירועים פעילים" value={events?.active ?? 0} />
              <EventStat label="אירועים שהסתיימו" value={events?.completed ?? 0} />
              <EventStat label={'סה"כ נרשמים'} value={events?.totalAttendees ?? 0} />
              <EventStat label="אחוז מילוי" value={`${attendanceRate}%`} />
            </View>
          </AdminCard>
        </>
      ) : null}
    </AdminShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value.toLocaleString('he-IL')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label, value, percent }: { color: string; label: string; value: number; percent: number }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendTextCol}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendValue}>{value.toLocaleString('he-IL')} · {percent}%</Text>
      </View>
    </View>
  );
}

function EventStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.eventStat}>
      <Text style={styles.eventValue}>{value}</Text>
      <Text style={styles.eventLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: 'flex-start',
    minWidth: 130,
  },
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  statsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 200,
    flexGrow: 1,
    gap: 6,
    minWidth: 160,
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  statValue: {
    ...typography.h1,
    color: colors.primaryLight,
  },
  statLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  donutWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  legendRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'center',
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  legendDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  legendTextCol: {
    alignItems: 'flex-end',
  },
  legendLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  legendValue: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  eventRows: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  eventStat: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 160,
    flexGrow: 1,
    gap: 4,
    minWidth: 130,
    paddingVertical: 16,
  },
  eventValue: {
    ...typography.h2,
    color: colors.text,
  },
  eventLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
