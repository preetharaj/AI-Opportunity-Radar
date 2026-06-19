import { getActiveSubscribers } from "@/lib/db/queries";

export async function GET() {
  const subscribers = await getActiveSubscribers();

  return Response.json({
    activeSubscribers: subscribers.length,
    subscriberEmails: subscribers,
    today: new Date().toISOString(),
  });
}