import { useEffect, useMemo, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminButton, AdminCard, AdminTextInput, StatusBadge } from '../../src/admin/components/AdminControls';
import { AdminShell } from '../../src/admin/components/AdminShell';
import { useAdminAuth } from '../../src/admin/AdminAuthContext';
import { listBusinessesForAdmin } from '../../src/admin/services';
import { adminErrorMessage, formatTimestamp, includesSearch } from '../../src/admin/utils';
import { BusinessProfile } from '../../src/services/business';
import { colors } from '../../src/theme';

export default function AdminBusinessesScreen() {
  const { admin } = useAdminAuth();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const hasActiveSearch = search.trim() !== '';

  const loadBusinesses = async (reset = true) => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listBusinessesForAdmin(reset ? null : cursor);
      setBusinesses(prev => reset ? page.items : [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(adminErrorMessage(err, 'Failed to load businesses'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses(true);
  }, [admin]);

  const filtered = useMemo(() => businesses.filter(business => (
    includesSearch([
      business.businessName,
      business.contactName,
      business.email,
      business.location,
      business.category,
    ].filter(Boolean).join(' '), search)
  )), [businesses, search]);

  return (
    <AdminShell title="ניהול עסקים">
      <AdminCard>
        <AdminTextInput label="חיפוש" value={search} onChangeText={setSearch} />
        <View style={styles.actions}>
          <AdminButton title="עסק חדש" onPress={() => router.push('/admin/businesses/new')} />
          <AdminButton title={loading ? 'טוען...' : 'רענון'} onPress={() => loadBusinesses(true)} variant="secondary" disabled={loading} />
          {cursor ? <AdminButton title="טען עוד" onPress={() => loadBusinesses(false)} disabled={loading} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {hasActiveSearch ? <Text style={styles.hint}>החיפוש מתבצע על {businesses.length} העסקים שנטענו. לחץ “טען עוד” כדי להרחיב את החיפוש בלי לבצע סריקה מלאה של Firestore.</Text> : null}
      </AdminCard>

      <Text style={styles.count}>{filtered.length} מתוך {businesses.length} עסקים שנטענו</Text>
      <View style={styles.table}>
        {filtered.map(business => (
          <Pressable key={business.uid} style={styles.row} onPress={() => router.push(`/admin/businesses/${business.uid}`)}>
            <View style={styles.mainCell}>
              <Text style={styles.name}>{business.businessName || 'ללא שם'}</Text>
              <Text style={styles.meta}>{business.location || '—'}</Text>
            </View>
            <StatusBadge status={business.accountStatus} />
            <Text style={styles.cell}>{business.contactName || '—'}</Text>
            <Text style={styles.cell}>{business.email || '—'}</Text>
            <Text style={styles.cell}>{business.category || '—'}</Text>
            <Text style={styles.cell}>{business.profileComplete ? 'מלא' : 'טיוטה'}</Text>
            <Text style={styles.cell}>נוצר: {formatTimestamp(business.createdAt)}</Text>
            <Text style={styles.cell}>פעילות: {formatTimestamp(business.lastActive)}</Text>
          </Pressable>
        ))}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
  hint: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  count: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  table: {
    gap: 10,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 14,
    padding: 14,
  },
  mainCell: {
    flex: 1,
    minWidth: 220,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  meta: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  cell: {
    color: colors.textSecondary,
    minWidth: 110,
    textAlign: 'right',
  },
});
