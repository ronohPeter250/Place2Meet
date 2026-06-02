import { useRouter } from 'expo-router';
import { AdminShell } from '../../../src/admin/components/AdminShell';
import { BusinessForm } from '../../../src/admin/components/BusinessForm';

export default function NewBusinessScreen() {
  const router = useRouter();

  return (
    <AdminShell title="עסק חדש">
      <BusinessForm onSaved={(businessId) => router.replace(`/admin/businesses/${businessId}`)} />
    </AdminShell>
  );
}
