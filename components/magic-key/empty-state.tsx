import { Sparkles } from "lucide-react";

export function EmptyState({ title, body }: { title: string; body: string }) {
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
