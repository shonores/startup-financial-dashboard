import NavBar from "@/components/NavBar";
import DashboardClient from "@/components/DashboardClient";
import { db } from "@/lib/db";
import { monthlySummaries, vendors, uploadLog } from "@/lib/schema";
import { desc, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { optionalAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await optionalAuth();
  if (!session) {
    redirect("/login");
  }

  const summaries = await db
    .select()
    .from(monthlySummaries)
    .orderBy(asc(monthlySummaries.month))
    .all();

  const vendorList = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.totalSpend))
    .all();

  const lastUpload = await db
    .select()
    .from(uploadLog)
    .orderBy(desc(uploadLog.id))
    .limit(1)
    .get();

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient
          summaries={summaries}
          vendors={vendorList}
          lastUpload={lastUpload ?? null}
        />
      </main>
    </div>
  );
}
