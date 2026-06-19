import { getActiveSubscribers } from "@/lib/db/queries";

export async function GET() {
  const subscribers = await getActiveSubscribers();

  return Response.json({
    totalSubscribers: subscribers.length,
    subscribers,
  });
}