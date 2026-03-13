import { STATUS_META } from "../../lib/magic-key/config";
import type { StatusType } from "../../lib/magic-key/types";
import { classNames } from "../../lib/magic-key/utils";
import { StatusIcon } from "./icons";

export function StatusBadge({
  status,
  compact = false,
}: {
  status: StatusType;
  compact?: boolean;
}) {
  const meta = STATUS_META[status];

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
        meta.tone,
        compact && "px-2.5 py-1 text-xs"
      )}
    >
      <StatusIcon status={status} size={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {compact ? meta.compactLabel : meta.label}
    </span>
  );
}
