// src/app/reminders/unsubscribe/page.tsx
import { Suspense } from "react";
import { ReminderUnsubscribeForm } from "./ReminderUnsubscribeForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ReminderUnsubscribePage() {
  return (
    <div className="max-w-sm mx-auto py-16">
      <div className="card p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Stop opportunity reminders</h1>
        <p className="text-sm text-gray-500 mb-4">
          This only stops reminders for one opportunity. Your newsletter subscription is unchanged.
        </p>
        <Suspense fallback={<div className="h-24" />}>
          <ReminderUnsubscribeForm />
        </Suspense>
      </div>
    </div>
  );
}
