import { notFound } from "next/navigation";
import { ComingSoon } from "../../../../components/coming-soon";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

// The list's rows already link here (customers-table.tsx) — this exists so
// that link lands on a real, permission-checked page rather than a 404,
// even though the full detail view (recent orders, profile fields) is its
// own future checkpoint. Reusing ComingSoon with the customer's real email
// as the title, rather than a static label, since the data is already one
// cheap, real API call away — never fake what's this close to real.
export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  await requireSession();
  const { id } = await params;

  const client = await getServerApiClient();
  const { data, error, response } = await client.GET("/api/v1/admin/customers/{id}", {
    params: { path: { id } },
  });

  if (error) {
    if (response.status === 404) notFound();
    throw new Error("Failed to load customer");
  }

  return <ComingSoon title={data.email} />;
}
