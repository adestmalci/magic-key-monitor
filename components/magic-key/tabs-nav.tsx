import type { TabKey } from "../../lib/magic-key/types";
import { classNames } from "../../lib/magic-key/utils";

export function TabsNav({
  activeTab,
  tabs,
  onTabChange,
}: {
  activeTab: TabKey;
  tabs: Array<{ id: TabKey; label: string }>;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <section className="rounded-[28px] border border-zinc-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={classNames(
              "rounded-2xl px-5 py-3 text-sm font-medium transition",
              activeTab === tab.id ? "bg-violet-600 text-white shadow" : "text-zinc-600 hover:bg-zinc-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </section>
  );
}
