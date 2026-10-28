import { Role } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { BusinessPartners, type BusinessPartnerView } from "@/components/business-partners";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function BusinessPartnersPage() {
  const context = await requirePageSession();
  const items = await db.businessPartner.findMany({
    where: { companyId: context.companyId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } }
  });
  const serialized: BusinessPartnerView[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    displayName: item.displayName,
    taxCode: item.taxCode,
    vatNumber: item.vatNumber,
    email: item.email,
    countryCode: item.countryCode,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    approvalId: item.approvals[0]?.id ?? null
  }));
  return <AppShell currentPath="/anagrafiche">
    <div className="pageHeading"><div><span className="eyebrow">Configurazione contabile</span><h1>Anagrafiche</h1><p>Prepara clienti e fornitori con revisione e approvazione esplicita.</p></div></div>
    <BusinessPartners items={serialized} canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN} />
  </AppShell>;
}
