import { useEffect, useMemo, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminButton, AdminCard, AdminSelect, AdminTextInput, StatusBadge } from '../../src/admin/components/AdminControls';
import { AdminShell } from '../../src/admin/components/AdminShell';
import { useAdminAuth } from '../../src/admin/AdminAuthContext';
import { listUsersForAdmin } from '../../src/admin/services';
import { AccountStatus } from '../../src/admin/types';
import { adminErrorMessage, calculateAgeFromBirthday, formatTimestamp, getEffectiveAccountStatus, includesSearch, timestampToDate } from '../../src/admin/utils';
import { UserProfile } from '../../src/services/users';
import { colors } from '../../src/theme';

type StatusFilter = AccountStatus | 'all';

const statusOptions: { label: string; value: StatusFilter }[] = [
  { label: 'הכל', value: 'all' },
  { label: 'פעילים', value: 'active' },
  { label: 'מושהים', value: 'suspended' },
  { label: 'חסומים', value: 'blocked' },
  { label: 'מחק', value: 'deleted' },
];

function parseLocalDateBoundary(value: string, boundary: 'start' | 'end'): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return boundary === 'start'
    ? new Date(year, month, day, 0, 0, 0, 0)
    : new Date(year, month, day, 23, 59, 59, 999);
}

export default function AdminUsersScreen() {
  const { admin } = useAdminAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [joinedFrom, setJoinedFrom] = useState('');
  const [joinedTo, setJoinedTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const hasActiveFilters = useMemo(() => (
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    minAge.trim() !== '' ||
    maxAge.trim() !== '' ||
    joinedFrom.trim() !== '' ||
    joinedTo.trim() !== ''
  ), [joinedFrom, joinedTo, maxAge, minAge, search, statusFilter]);

  const loadUsers = async (reset = true) => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listUsersForAdmin(reset ? null : cursor);
      setUsers(prev => reset ? page.items : [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(adminErrorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(true);
  }, [admin]);

  const filteredUsers = useMemo(() => {
    const fromDate = parseLocalDateBoundary(joinedFrom, 'start');
    const toDate = parseLocalDateBoundary(joinedTo, 'end');
    return users.filter(user => {
      const age = calculateAgeFromBirthday(user.birthday);
      const textMatches = includesSearch([user.name, user.city].filter(Boolean).join(' '), search);
      const statusMatches = statusFilter === 'all' || getEffectiveAccountStatus(user.accountStatus) === statusFilter;
      const minMatches = minAge.trim() === '' || (age != null && age >= Number(minAge));
      const maxMatches = maxAge.trim() === '' || (age != null && age <= Number(maxAge));
      const createdAt = timestampToDate(user.createdAt);
      const fromMatches = !fromDate || Number.isNaN(fromDate.getTime()) || (createdAt != null && createdAt >= fromDate);
      const toMatches = !toDate || Number.isNaN(toDate.getTime()) || (createdAt != null && createdAt <= toDate);
      return textMatches && statusMatches && minMatches && maxMatches && fromMatches && toMatches;
    });
  }, [joinedFrom, joinedTo, maxAge, minAge, search, statusFilter, users]);

  return (
    <AdminShell title="ניהול משתמשים">
      <AdminCard>
        <View style={styles.filters}>
          <AdminTextInput label="חיפוש לפי שם או עיר" value={search} onChangeText={setSearch} />
          <AdminTextInput label="גיל מינימלי" value={minAge} onChangeText={setMinAge} keyboardType="numeric" />
          <AdminTextInput label="גיל מקסימלי" value={maxAge} onChangeText={setMaxAge} keyboardType="numeric" />
          <AdminTextInput label="Joined from (YYYY-MM-DD)" value={joinedFrom} onChangeText={setJoinedFrom} />
          <AdminTextInput label="Joined to (YYYY-MM-DD)" value={joinedTo} onChangeText={setJoinedTo} />
        </View>
        <AdminSelect label="סטטוס" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
        <View style={styles.actions}>
          <AdminButton title={loading ? 'טוען...' : 'רענון'} onPress={() => loadUsers(true)} disabled={loading} variant="secondary" />
          {cursor ? <AdminButton title="טען עוד" onPress={() => loadUsers(false)} disabled={loading} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {hasActiveFilters ? <Text style={styles.hint}>הסינון מתבצע על {users.length} המשתמשים שנטענו. לחץ “טען עוד” כדי להרחיב את החיפוש בלי לבצע סריקה מלאה של Firestore.</Text> : null}
      </AdminCard>

      <Text style={styles.count}>{filteredUsers.length} מתוך {users.length} משתמשים שנטענו</Text>
      <View style={styles.table}>
        {filteredUsers.map(user => {
          const age = calculateAgeFromBirthday(user.birthday);
          return (
            <Pressable key={user.uid} style={styles.row} onPress={() => router.push(`/admin/users/${user.uid}`)}>
              <View style={styles.mainCell}>
                <Text style={styles.name}>{user.name || 'ללא שם'}</Text>
                <Text style={styles.meta}>{user.city || '—'} · {age ?? '—'} · {user.photos?.length ?? 0} תמונות</Text>
              </View>
              <StatusBadge status={user.accountStatus} />
              <Text style={styles.cell}>נוצר: {formatTimestamp(user.createdAt)}</Text>
              <Text style={styles.cell}>פעילות: {formatTimestamp(user.lastActive)}</Text>
            </Pressable>
          );
        })}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  actions: {
    alignSelf: 'flex-start',
    minWidth: 130,
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
    minWidth: 120,
    textAlign: 'right',
  },
});
