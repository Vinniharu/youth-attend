import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { QrDisplay } from "@/components/qr/qr-display";
import { getSessionAttendance } from "@/lib/attendance";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Check-in code" };

/** Full-screen check-in code for the church screen (covers the admin chrome). */
export default function DisplayPage({ params }: PageProps<"/admin/sessions/[id]/display">) {
  return (
    <Suspense fallback={null}>
      <Display params={params} />
    </Suspense>
  );
}

async function Display({ params }: Pick<PageProps<"/admin/sessions/[id]/display">, "params">) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const attendance = await getSessionAttendance(id);
  if (!attendance) notFound();

  const title = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${attendance.session.serviceDate}T00:00:00Z`));

  return <QrDisplay sessionId={id} title={title} backHref={`/admin/sessions/${id}`} />;
}
