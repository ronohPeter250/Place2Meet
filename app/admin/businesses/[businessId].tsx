import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AdminCard } from '../../../src/admin/components/AdminControls';
import { AdminShell } from '../../../src/admin/components/AdminShell';
import { BusinessForm } from '../../../src/admin/components/BusinessForm';
import { getBusinessForAdmin } from '../../../src/admin/services';
import { BusinessProfile } from '../../../src/services/business';
import { colors } from '../../../src/theme';

export default function EditBusinessScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!businessId) return;
    getBusinessForAdmin(businessId).then(setBusiness).catch(() => setBusiness(null));
  }, [businessId]);

  return (
    <AdminShell title="עריכת עסק">
      {business === undefined ? (
        <AdminCard><Text style={{ color: colors.text }}>טוען...</Text></AdminCard>
      ) : business === null ? (
        <AdminCard><Text style={{ color: colors.text }}>העסק לא נמצא</Text></AdminCard>
      ) : (
        <BusinessForm initialBusiness={business} onSaved={(id) => router.replace(`/admin/businesses/${id}`)} />
      )}
    </AdminShell>
  );
}
