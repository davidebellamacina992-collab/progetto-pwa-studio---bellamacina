import { AppShell } from "@/components/app-shell";
import { ApprovalDetailView } from "@/components/approval-detail";
import { requirePageSession } from "@/lib/page-auth";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  return <AppShell currentPath="/approvazioni"><ApprovalDetailView id={id} /></AppShell>;
}
