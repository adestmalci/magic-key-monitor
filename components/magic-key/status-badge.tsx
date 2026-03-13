import { CircleOff } from "lucide-react";
import { STATUS_META } from "../../lib/magic-key/config";
import type { StatusType } from "../../lib/magic-key/types";
import { classNames } from "../../lib/magic-key/utils";

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
      {meta.iconPath ? (
        <img
          src={meta.iconPath}
          alt=""
          className={compact ? "h-3.5 w-3.5 object-contain" : "h-4 w-4 object-contain"}
        />
      ) : status === "blocked" ? (
        <CircleOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : null}
      {compact ? meta.compactLabel : meta.label}
    </span>
  );
}
