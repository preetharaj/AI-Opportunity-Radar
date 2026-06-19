import { getActiveSubscribers } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const subscribers = await getActiveSubscribers();

  return Response.json({
    totalSubscribers: subscribers.length,
    subscribers,
  });
}