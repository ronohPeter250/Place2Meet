import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AdminButton, AdminCard, AdminSelect, AdminTextInput, StatusBadge } from '../../../src/admin/components/AdminControls';
import { AdminShell } from '../../../src/admin/components/AdminShell';
import { getAuditLogsForTarget, getUserForAdmin, updateUserAdminNotes, updateUserPhotoModeration, updateUserStatus } from '../../../src/admin/services';
import { AccountStatus, AdminAuditLog, PhotoModerationStatus } from '../../../src/admin/types';
import { adminErrorMessage, calculateAgeFromBirthday, formatTimestamp, getEffectiveAccountStatus, photoModerationKey } from '../../../src/admin/utils';
import { UserProfile } from '../../../src/services/users';
import { colors } from '../../../src/theme';

const statusOptions: { label: string; value: AccountStatus }[] = [
  { label: 'פעיל', value: 'active' },
  { label: 'מושהה', value: 'suspended' },
  { label: 'חסום', value: 'blocked' },
];

export default function AdminUserDetailsScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [notes, setNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<AccountStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!userId) return;
    setError(null);
    try {
      const [profile, auditLogs] = await Promise.all([
        getUserForAdmin(userId),
        getAuditLogsForTarget('user', userId),
      ]);
      setUser(profile);
      setNotes(profile?.adminNotes ?? '');
      setSelectedStatus(getEffectiveAccountStatus(profile?.accountStatus));
      setLogs(auditLogs);
    } catch (err) {
      setError(adminErrorMessage(err, 'Failed to load user details'));
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  const runAction = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(adminErrorMessage(err, 'Failed to update user'));
    } finally {
      setSaving(false);
    }
  };

  const saveChanges = () => {
    if (!user) return;
    runAction(async () => {
      if (selectedStatus !== getEffectiveAccountStatus(user.accountStatus)) {
        await updateUserStatus(user.uid, user.accountStatus, selectedStatus);
      }
      if (notes !== (user.adminNotes ?? '')) {
        await updateUserAdminNotes(user.uid, user.adminNotes, notes);
      }
    });
  };

  const moderatePhoto = (photo: string, status: PhotoModerationStatus) => {
    if (!user) return;
    runAction(() => updateUserPhotoModeration(user.uid, photo, status));
  };

  const age = calculateAgeFromBirthday(user?.birthday);
  const hasUnsavedChanges = Boolean(user) && (
    selectedStatus !== getEffectiveAccountStatus(user?.accountStatus) ||
    notes !== (user?.adminNotes ?? '')
  );

  return (
    <AdminShell title="פרטי משתמש">
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!user ? (
        <AdminCard><Text style={styles.text}>טוען...</Text></AdminCard>
      ) : (
        <>
          <AdminCard title={user.name || 'משתמש'}>
            <View style={styles.summary}>
              <StatusBadge status={user.accountStatus} />
              <Text style={styles.text}>עיר: {user.city || '—'}</Text>
              <Text style={styles.text}>גיל: {age ?? '—'}</Text>
              <Text style={styles.text}>מגדר: {user.gender}</Text>
              <Text style={styles.text}>נוצר: {formatTimestamp(user.createdAt)}</Text>
              <Text style={styles.text}>פעילות אחרונה: {formatTimestamp(user.lastActive)}</Text>
              <Text style={styles.text}>מסומן: {user.flagged ? 'כן' : 'לא'}</Text>
            </View>
            <Text style={styles.bio}>{user.bio || 'אין תיאור'}</Text>
          </AdminCard>

          <AdminCard title="סטטוס ופעולות">
            <AdminSelect label="סטטוס חשבון" value={selectedStatus} options={statusOptions} onChange={setSelectedStatus} />
            {selectedStatus === 'deleted' ? <Text style={styles.warning}>המשתמש מסומן למחיקה. לחץ “שמור שינויים” כדי להחיל.</Text> : null}
            <View style={styles.actions}>
              <AdminButton title={saving ? 'שומר...' : 'שמור שינויים'} onPress={saveChanges} disabled={saving || !hasUnsavedChanges} />
            </View>
          </AdminCard>

          <AdminCard title="הערות אדמין">
            <AdminTextInput label="הערות" value={notes} onChangeText={setNotes} multiline style={styles.notes} />
          </AdminCard>

          <AdminCard title="תמונות">
            <View style={styles.photos}>
              {(user.photos ?? []).map((photo, index) => (
                <View key={`${photo}-${index}`} style={styles.photoCard}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <Text style={styles.text}>סטטוס: {user.photoModeration?.[photoModerationKey(photo)] ?? 'pending'}</Text>
                  <View style={styles.photoActions}>
                    <AdminButton title="אשר" onPress={() => moderatePhoto(photo, 'approved')} variant="secondary" disabled={saving} />
                    <AdminButton title="דחה" onPress={() => moderatePhoto(photo, 'rejected')} variant="danger" disabled={saving} />
                  </View>
                </View>
              ))}
              {(user.photos ?? []).length === 0 ? <Text style={styles.text}>אין תמונות</Text> : null}
            </View>
          </AdminCard>

          <AdminCard title="יומן פעולות">
            {logs.map(log => (
              <View key={log.id ?? `${log.action}-${log.createdAt}`} style={styles.logRow}>
                <Text style={styles.text}>{log.action}</Text>
                <Text style={styles.muted}>{formatTimestamp(log.createdAt)} · {log.adminEmail ?? log.adminId}</Text>
              </View>
            ))}
            {logs.length === 0 ? <Text style={styles.text}>אין פעולות להצגה</Text> : null}
          </AdminCard>

          <AdminCard title="מחיקת משתמש">
            <Text style={styles.muted}>הכפתור מסמן את המשתמש למחיקה בלבד. השינוי יישמר רק אחרי לחיצה על “שמור שינויים”.</Text>
            <View style={styles.dangerActions}>
              <AdminButton title={selectedStatus === 'deleted' ? 'מחק נבחר' : 'מחק'} onPress={() => setSelectedStatus('deleted')} variant="danger" disabled={saving || selectedStatus === 'deleted'} />
              <AdminButton title={saving ? 'שומר...' : 'שמור שינויים'} onPress={saveChanges} disabled={saving || !hasUnsavedChanges} />
            </View>
          </AdminCard>
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
  warning: {
    color: colors.errorLight,
    fontWeight: '700',
    textAlign: 'right',
  },
  text: {
    color: colors.text,
    textAlign: 'right',
  },
  muted: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  bio: {
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'right',
  },
  summary: {
    alignItems: 'flex-end',
    gap: 8,
  },
  actions: {
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  dangerActions: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  notes: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  photos: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 14,
  },
  photoCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 10,
    width: 220,
  },
  photo: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    height: 180,
    width: '100%',
  },
  photoActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  logRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
});
