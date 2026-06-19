// src/app/unsubscribe/page.tsx
import { Suspense } from "react";
import { UnsubscribeForm } from "./UnsubscribeForm";

export default function UnsubscribePage() {
  return (
    <div className="max-w-sm mx-auto py-16">
      <div className="card p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Unsubscribe</h1>
        <Suspense fallback={<div className="h-24" />}>
          <UnsubscribeForm />
        </Suspense>
      </div>
    </div>
  );
}
