// src/app/tracking/PipelineBoard.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { differenceInDays, parseISO } from "date-fns";
import type { ApplicationStatus, Opportunity } from "@/lib/types";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  researching: "Researching",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  accepted: "Accepted",
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "border-gray-200",
  researching: "border-blue-200",
  applied: "border-indigo-200",
  interview: "border-purple-200",
  rejected: "border-red-200",
  accepted: "border-emerald-200",
};

interface Item {
  opportunityId: string;
  status: ApplicationStatus;
  opportunity: Opportunity;
  updatedAt: Date;
}

interface Props {
  grouped: Record<string, Item[]>;
  statuses: readonly ApplicationStatus[];
}

export function PipelineBoard({ grouped: initial, statuses }: Props) {
  const [items, setItems] = useState<Record<string, Item[]>>(initial as any);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moveItem(opportunityId: string, fromStatus: ApplicationStatus, toStatus: ApplicationStatus) {
    if (fromStatus === toStatus) return;
    setUpdating(opportunityId);
    setError(null);

    // Optimistic update
    setItems((prev) => {
      const item = prev[fromStatus]?.find((i) => i.opportunityId === opportunityId);
      if (!item) return prev;
      return {
        ...prev,
        [fromStatus]: prev[fromStatus].filter((i) => i.opportunityId !== opportunityId),
        [toStatus]: [...(prev[toStatus] ?? []), { ...item, status: toStatus }],
      };
    });

    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, status: toStatus }),
      });

      if (!res.ok) {
        // Roll back — move the card back to where it was
        setItems((prev) => {
          const item = prev[toStatus]?.find((i) => i.opportunityId === opportunityId);
          if (!item) return prev;
          return {
            ...prev,
            [toStatus]: prev[toStatus].filter((i) => i.opportunityId !== opportunityId),
            [fromStatus]: [...(prev[fromStatus] ?? []), { ...item, status: fromStatus }],
          };
        });
        setError("Couldn't update status. Try again.");
      }
    } catch {
      setItems((prev) => {
        const item = prev[toStatus]?.find((i) => i.opportunityId === opportunityId);
        if (!item) return prev;
        return {
          ...prev,
          [toStatus]: prev[toStatus].filter((i) => i.opportunityId !== opportunityId),
          [fromStatus]: [...(prev[fromStatus] ?? []), { ...item, status: fromStatus }],
        };
      });
      setError("Network error. Try again.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {statuses.map((status) => (
        <div key={status} className={`rounded-xl border-2 ${STATUS_COLORS[status]} bg-white p-2`}>
          <div className="text-xs font-semibold text-gray-600 mb-2 px-1 flex items-center justify-between">
            <span>{STATUS_LABELS[status]}</span>
            <span className="bg-gray-100 text-gray-500 rounded-full w-4 h-4 flex items-center justify-center text-xs">
              {items[status]?.length ?? 0}
            </span>
          </div>

          <div className="space-y-2 min-h-[60px]">
            {(items[status] ?? []).map((item) => {
              const days = differenceInDays(parseISO(item.opportunity.deadline), new Date());
              return (
                <div key={item.opportunityId} className="rounded-lg bg-gray-50 p-2 text-xs">
                  <Link
                    href={`/opportunity/${item.opportunityId}`}
                    className="font-medium text-gray-800 hover:text-indigo-600 line-clamp-2 leading-snug"
                  >
                    {item.opportunity.title}
                  </Link>
                  <div className="flex items-center justify-between mt-1">
                    <span className={days <= 7 ? "text-red-500 font-medium" : days <= 30 ? "text-amber-500" : "text-gray-400"}>
                      {days < 0 ? "Closed" : `${days}d`}
                    </span>
                    <select
                      value={status}
                      disabled={updating === item.opportunityId}
                      onChange={(e) => moveItem(item.opportunityId, status, e.target.value as ApplicationStatus)}
                      className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white cursor-pointer"
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}

            {(items[status] ?? []).length === 0 && (
              <div className="border border-dashed border-gray-200 rounded-lg h-10 flex items-center justify-center">
                <span className="text-gray-300 text-xs">Empty</span>
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
