"use client";

import { RefreshCcw, Sparkles } from "lucide-react";

type ActivityItem = {
  id: string;
  createdAt: string;
  source: "manual" | "auto" | "startup" | "system";
  trigger?: string;
  message: string;
  details?: string[];
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function formatActivityTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

export function ActivitySection({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
        <RefreshCcw className="h-6 w-6 text-violet-600" />
        Sync history
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Manual and automatic syncs are labeled differently so the history is easier to read.
      </p>

      <div className="mt-6">
        {activity.length === 0 ? (
          <EmptyState
            title="No sync activity yet"
            body="Your sync history will appear here after you manually sync or after an automatic interval runs."
          />
        ) : (
          <div className="space-y-3">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={classNames(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        item.source === "manual"
                          ? "bg-violet-100 text-violet-800"
                          : item.source === "auto"
                            ? "bg-sky-100 text-sky-800"
                            : item.source === "startup"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-200 text-zinc-700"
                      )}
                    >
                      {item.source === "manual"
                        ? "Manual sync"
                        : item.source === "auto"
                          ? "Auto sync"
                          : item.source === "startup"
                            ? "Startup sync"
                            : "System"}
                    </span>

                    <span className="text-xs text-zinc-500">
                      {formatActivityTime(item.createdAt)}
                    </span>
                  </div>

                  {item.trigger ? (
                    <div className="mt-2">
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                        Trigger: {item.trigger}
                      </span>
                    </div>
                  ) : null}

                  <div className="mt-2 text-sm text-zinc-800">{item.message}</div>

                  {item.details && item.details.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {item.details.map((detail, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700"
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
