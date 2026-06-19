import { getActiveSubscribers } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const subscribers = await getActiveSubscribers();

  return Response.json({
    activeSubscribers: subscribers.length,
    subscriberEmails: subscribers,
    today: new Date().toISOString(),
  });
}