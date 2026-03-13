import { PASS_TYPES } from "../../lib/magic-key/config";
import type { ParkOption, PassType, StatusType } from "../../lib/magic-key/types";
import { classNames } from "../../lib/magic-key/utils";

export function PassIcon({ passType, size = "h-5 w-5" }: { passType: PassType; size?: string }) {
  const pass = PASS_TYPES.find((item) => item.id === passType)!;
  return <img src={pass.iconPath} alt={pass.name} className={classNames(size, "object-contain")} />;
}

export function ParkIcon({ park, size = "h-4 w-4" }: { park: ParkOption | StatusType; size?: string }) {
  const path =
    park === "either"
      ? "/branding/either-available.png"
      : park === "dl"
        ? "/branding/disneyland-available.png"
        : park === "dca"
          ? "/branding/dca-available.png"
          : undefined;

  if (!path) return null;
  return <img src={path} alt="" className={classNames(size, "object-contain")} />;
}
