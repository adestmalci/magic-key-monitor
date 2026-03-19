"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { PASS_TYPES } from "../../lib/magic-key/config";
import type {
  DisneyWorkerJob,
  FeedRow,
  ImportedDisneyMember,
  LocalWorkerDevice,
  PlannerHubConnectionState,
  PlannerHubBookingState,
  PlannerHubBookingStatus,
  ReservationAssistState,
  ReservationHandoffOutcome,
  ReservationSessionStatus,
  SessionUser,
  SyncMeta,
  WatchItem,
} from "../../lib/magic-key/types";
import { buildFeedLookup, classNames, formatSyncTime, formatWatchDate, resolveStatus } from "../../lib/magic-key/utils";

type ReservationAssistSectionProps = {
  reservationAssist: ReservationAssistState;
  plannerHubBooking: PlannerHubBookingState;
  plannerHubConnection: PlannerHubConnectionState;
  latestDisneyJob: DisneyWorkerJob | null;
  importedDisneyMembers: ImportedDisneyMember[];
  localWorkerDevices: LocalWorkerDevice[];
  syncMeta: SyncMeta;
  sessionUser: SessionUser | null;
  watchItems: WatchItem[];
  feedRows: FeedRow[];
  onReservationAssistChange: (patch: Partial<ReservationAssistState>) => void;
  onPlannerHubBookingChange: (patch: Partial<PlannerHubBookingState>) => void;
  onPlannerHubConnectionChange: (patch: Partial<PlannerHubConnectionState>) => void;
  onWatchItemBookingChange: (
    id: string,
    patch: Partial<Pick<WatchItem, "plannerHubId" | "selectedImportedMemberIds" | "bookingMode">>
  ) => void;
  onConnectDisney: (disneyEmail: string, password: string) => Promise<boolean | string> | boolean | string;
  onCreateLocalWorkerPairToken: (deviceName: string) => Promise<string> | string;
  onImportConnectedMembers: () => Promise<boolean> | boolean;
  onResetDisneyConnection: () => Promise<boolean> | boolean;
  onRefreshState: () => Promise<void> | void;
  onRefreshDisneyStatus: () => Promise<void> | void;
};

const DISNEY_SELECT_PARTY_URL = "https://disneyland.disney.go.com/entry-reservation/add/select-party/";
const DISNEY_PROFILE_URL = "https://disneyland.disney.go.com/profile/";
const HANDOFF_STORAGE_KEY = "magic-key-reserve-handoff";

const resultActions: Array<{
  outcome: ReservationHandoffOutcome;
  label: string;
  note: string;
}> = [
  {
    outcome: "worked",
    label: "Disney session worked",
    note: "The planner reached the reservation flow and the connected members looked correct.",
  },
  {
    outcome: "needed_login",
    label: "Needed login",
    note: "Disney required password or one-time-code login before the reservation flow could continue.",
  },
  {
    outcome: "party_mismatch",
    label: "Wrong party or passes",
    note: "Disney opened, but the expected connected members or passes were missing or mismatched.",
  },
  {
    outcome: "flow_changed",
    label: "Flow changed / could not finish",
    note: "Disney changed the order or the flow could not reach the expected path cleanly.",
  },
];

const connectionTone: Record<
  PlannerHubConnectionState["status"],
  { label: string; tone: string; helper: string }
> = {
  disconnected: {
    label: "Disconnected",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-700",
    helper: "Connect a real Disney planner hub so the worker can import the connected party.",
  },
  pending_connect: {
    label: "Connecting",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
    helper: "Your active local Mac is opening Disney, checking the dedicated local profile, and importing connected members.",
  },
  connected: {
    label: "Connected",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    helper: "The active local Mac has a working Disney session in its dedicated local profile and imported members ready for targeting.",
  },
  importing: {
    label: "Importing",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
    helper: "The active local Mac is refreshing the connected party from Disney's select-party flow.",
  },
  paused_login: {
    label: "Paused for login",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    helper: "Disney needs a fresh login or one-time code before the worker can continue.",
  },
  paused_mismatch: {
    label: "Paused for mismatch",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
    helper: "The live Disney flow no longer matches the expected connected party or page structure.",
  },
  failed: {
    label: "Failed",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
    helper: "The last Disney connection or import attempt failed closed.",
  },
};

const bookingMeta: Record<PlannerHubBookingStatus, { label: string; tone: string }> = {
  idle: { label: "Idle", tone: "border-zinc-200 bg-zinc-50 text-zinc-700" },
  armed: { label: "Armed", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  paused_login: { label: "Paused for login", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  paused_mismatch: { label: "Paused for mismatch", tone: "border-rose-200 bg-rose-50 text-rose-900" },
  attempting: { label: "Attempting", tone: "border-sky-200 bg-sky-50 text-sky-900" },
  booked: { label: "Booked", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  failed: { label: "Failed", tone: "border-rose-200 bg-rose-50 text-rose-900" },
};

const livePhaseOrder = [
  "queued",
  "started",
  "disney_open",
  "email_step",
  "password_step",
  "select_party",
  "members_imported",
  "session_captured",
  "completed",
] as const;

const phaseLabels: Record<(typeof livePhaseOrder)[number], string> = {
  queued: "Request queued",
  started: "Worker started",
  disney_open: "Opening Disney",
  email_step: "Email step",
  password_step: "Password step",
  select_party: "Select-party import",
  members_imported: "Members imported",
  session_captured: "Session captured",
  completed: "Finished",
};

function deriveConnectionStatus(
  plannerHubConnection: PlannerHubConnectionState,
  latestDisneyJob: DisneyWorkerJob | null
): PlannerHubConnectionState["status"] {
  if (!latestDisneyJob) {
    return plannerHubConnection.status;
  }

  if (latestDisneyJob.status === "processing") {
    return latestDisneyJob.type === "import" ? "importing" : "pending_connect";
  }

  if (latestDisneyJob.status === "queued") {
    return latestDisneyJob.type === "import" ? "importing" : "pending_connect";
  }

  if (latestDisneyJob.status === "failed") {
    if (latestDisneyJob.phase === "paused_login") return "paused_login";
    if (latestDisneyJob.phase === "paused_mismatch") return "paused_mismatch";
    return "failed";
  }

  if (latestDisneyJob.status === "completed") {
    return plannerHubConnection.hasEncryptedSession || plannerHubConnection.hasLocalSession
      ? "connected"
      : plannerHubConnection.status;
  }

  return plannerHubConnection.status;
}

function summarizeEligibility(member: ImportedDisneyMember, item: WatchItem, lookup: Map<string, WatchItem["currentStatus"]>) {
  if (!member.automatable || !member.magicKeyPassType) {
    return { eligible: false, status: "unavailable" as const };
  }

  const status = resolveStatus(
    {
      date: item.date,
      passType: member.magicKeyPassType,
      preferredPark: item.preferredPark,
    },
    lookup
  );

  return {
    eligible: status !== "blocked",
    status,
  };
}

export function ReservationAssistSection({
  reservationAssist,
  plannerHubBooking,
  plannerHubConnection,
  latestDisneyJob,
  importedDisneyMembers,
  localWorkerDevices,
  syncMeta,
  sessionUser,
  watchItems,
  feedRows,
  onReservationAssistChange,
  onPlannerHubBookingChange,
  onPlannerHubConnectionChange,
  onWatchItemBookingChange,
  onConnectDisney,
  onCreateLocalWorkerPairToken,
  onImportConnectedMembers,
  onResetDisneyConnection,
  onRefreshState,
  onRefreshDisneyStatus,
}: ReservationAssistSectionProps) {
  const [disneyEmail, setDisneyEmail] = useState(
    plannerHubConnection.disneyEmail || reservationAssist.plannerHubEmail || sessionUser?.email || ""
  );
  const [password, setPassword] = useState("");
  const [targetWatchId, setTargetWatchId] = useState<string>(watchItems[0]?.id ?? "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pairDeviceName, setPairDeviceName] = useState("My Mac");
  const [pairToken, setPairToken] = useState("");
  const [isCreatingPairToken, setIsCreatingPairToken] = useState(false);

  useEffect(() => {
    if (plannerHubConnection.status !== "pending_connect" && plannerHubConnection.status !== "importing") {
      return;
    }

    const timer = window.setInterval(() => {
      void onRefreshDisneyStatus();
    }, 2_500);

    return () => window.clearInterval(timer);
  }, [onRefreshDisneyStatus, plannerHubConnection.status]);

  const activeLocalDevice =
    localWorkerDevices.find((device) => device.id === plannerHubConnection.activeDeviceId) ||
    localWorkerDevices.find((device) => device.status === "active") ||
    null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        lastHandoffAt?: string;
        lastHandoffTargetLabel?: string;
      };

      if (parsed.lastHandoffAt && reservationAssist.sessionStatus !== "checking") {
        onReservationAssistChange({
          sessionStatus: "checking",
          lastHandoffAt: parsed.lastHandoffAt,
          lastHandoffTargetLabel: parsed.lastHandoffTargetLabel || reservationAssist.lastHandoffTargetLabel,
        });
      }
    } catch {
      // Ignore stale temporary handoff state.
    }
  }, [onReservationAssistChange, reservationAssist.lastHandoffTargetLabel, reservationAssist.sessionStatus]);

  useEffect(() => {
    const nextEmail = plannerHubConnection.disneyEmail || reservationAssist.plannerHubEmail || sessionUser?.email || "";
    setDisneyEmail(nextEmail);
  }, [plannerHubConnection.disneyEmail, reservationAssist.plannerHubEmail, sessionUser?.email]);

  useEffect(() => {
    if (!watchItems.length) {
      if (targetWatchId) setTargetWatchId("");
      return;
    }

    if (!watchItems.some((item) => item.id === targetWatchId)) {
      setTargetWatchId(watchItems[0]?.id ?? "");
    }
  }, [targetWatchId, watchItems]);

  useEffect(() => {
    const selectedCount = watchItems.filter((item) => item.bookingMode === "watch_and_attempt" && item.selectedImportedMemberIds.length > 0).length;
    const nextStatus: PlannerHubBookingStatus = !plannerHubBooking.enabled
      ? "idle"
      : plannerHubConnection.status === "paused_login"
        ? "paused_login"
        : plannerHubConnection.status === "paused_mismatch" || reservationAssist.lastHandoffOutcome === "party_mismatch"
          ? "paused_mismatch"
          : reservationAssist.stepTwoVerified && plannerHubConnection.status === "connected" && selectedCount > 0
            ? "armed"
            : "idle";

    const nextAction = !plannerHubBooking.enabled
      ? "Enable booking mode when you are ready to arm connected member targets."
      : plannerHubConnection.status === "paused_login"
        ? "Reconnect the Disney planner hub so the worker has a live session again."
        : plannerHubConnection.status === "paused_mismatch"
          ? "Re-import the connected party and verify the Disney flow again."
          : !reservationAssist.stepTwoVerified
            ? "Finish the Step 2 sign-off before arming background booking."
            : selectedCount === 0
              ? "Choose at least one eligible imported Magic Key member on a watched date."
              : "The planner hub foundation is ready for future booking attempts.";

    const nextResult =
      nextStatus === "armed"
        ? `${selectedCount} watched ${selectedCount === 1 ? "date is" : "dates are"} armed with imported Disney member targets.`
        : nextStatus === "paused_login"
          ? "Background booking is paused because Disney login needs attention."
          : nextStatus === "paused_mismatch"
            ? "Background booking is paused because the imported Disney party no longer matches expectations."
            : "Background booking foundation is staged but not armed yet.";

    if (
      plannerHubBooking.status !== nextStatus ||
      plannerHubBooking.lastRequiredActionMessage !== nextAction ||
      plannerHubBooking.lastResultMessage !== nextResult
    ) {
      onPlannerHubBookingChange({
        status: nextStatus,
        lastRequiredActionMessage: nextAction,
        lastResultMessage: nextResult,
      });
    }
  }, [
    onPlannerHubBookingChange,
    plannerHubBooking.enabled,
    plannerHubBooking.lastRequiredActionMessage,
    plannerHubBooking.lastResultMessage,
    plannerHubBooking.status,
    plannerHubConnection.status,
    reservationAssist.lastHandoffOutcome,
    reservationAssist.stepTwoVerified,
    watchItems,
  ]);

  const lookup = useMemo(() => buildFeedLookup(feedRows), [feedRows]);
  const currentTarget = useMemo(
    () => watchItems.find((item) => item.id === targetWatchId) ?? watchItems[0] ?? null,
    [targetWatchId, watchItems]
  );
  const magicKeyMembers = useMemo(
    () => importedDisneyMembers.filter((member) => member.entitlementType === "magic_key"),
    [importedDisneyMembers]
  );
  const ticketHolders = useMemo(
    () => importedDisneyMembers.filter((member) => member.entitlementType === "ticket_holder"),
    [importedDisneyMembers]
  );
  const eligibleMembers = useMemo(() => {
    if (!currentTarget) return [] as ImportedDisneyMember[];
    return magicKeyMembers.filter((member) => summarizeEligibility(member, currentTarget, lookup).eligible);
  }, [currentTarget, lookup, magicKeyMembers]);
  const selectedCount = currentTarget?.selectedImportedMemberIds.length ?? 0;
  const canArmCurrentTarget = Boolean(currentTarget && selectedCount > 0 && plannerHubConnection.status === "connected" && reservationAssist.stepTwoVerified);
  const verificationProgress = [
    reservationAssist.plannerHubConfirmed,
    reservationAssist.partyProofCaptured,
    reservationAssist.flowProofCaptured,
    reservationAssist.confirmProofCaptured,
  ].filter(Boolean).length;
  const showCheckpoint = reservationAssist.sessionStatus === "checking";
  const effectiveConnectionStatus = deriveConnectionStatus(plannerHubConnection, latestDisneyJob);
  const currentConnectionMeta = connectionTone[effectiveConnectionStatus];
  const currentBookingMeta = bookingMeta[plannerHubBooking.status];
  const activeDisneyJob =
    effectiveConnectionStatus === "pending_connect" || effectiveConnectionStatus === "importing";
  const hasTerminalFailure =
    effectiveConnectionStatus === "failed" ||
    effectiveConnectionStatus === "paused_login" ||
    effectiveConnectionStatus === "paused_mismatch";
  const connectionTimeline = livePhaseOrder.map((phase) => {
    const event = latestDisneyJob?.events.find((entry) => entry.phase === phase);
    return {
      phase,
      label: phaseLabels[phase],
      at: event?.at || "",
      message: event?.message || "",
      complete: Boolean(event),
    };
  });
  const failureEvent =
    latestDisneyJob?.events.find((entry) => entry.phase === "paused_login") ||
    latestDisneyJob?.events.find((entry) => entry.phase === "paused_mismatch") ||
    latestDisneyJob?.events.find((entry) => entry.phase === "failed") ||
    null;
  const latestFailureMessage =
    latestDisneyJob?.lastError ||
    latestDisneyJob?.lastMessage ||
    plannerHubConnection.lastAuthFailureReason ||
    plannerHubConnection.lastRequiredActionMessage ||
    "";
  const latestWorkerMessage =
    latestDisneyJob?.lastMessage ||
    plannerHubConnection.lastRequiredActionMessage ||
    (plannerHubConnection.hasLocalSession
      ? "The active Mac has a device-local Disney session ready for connect attempts."
      : "Pair a local Mac and sign into Disney there before you try to connect.");
  const claimedJobValue =
    plannerHubConnection.lastClaimedJobId ||
    (latestDisneyJob?.startedAt ? latestDisneyJob.id : "") ||
    "No claim recorded yet";
  const reportedJobValue =
    plannerHubConnection.lastReportedJobId ||
    (latestDisneyJob?.finishedAt ? latestDisneyJob.id : "") ||
    "No report recorded yet";
  const correlationRows = [
    { label: "Queued job", value: plannerHubConnection.lastQueuedJobId || latestDisneyJob?.id || "None yet" },
    { label: "Claimed job", value: claimedJobValue },
    { label: "Reported job", value: reportedJobValue },
    {
      label: "Worker result",
      value: (plannerHubConnection.lastWorkerResultAt || plannerHubConnection.latestJobUpdatedAt)
        ? `${formatSyncTime(plannerHubConnection.lastWorkerResultAt || plannerHubConnection.latestJobUpdatedAt)}${
            plannerHubConnection.lastWorkerResultSource ? ` • ${plannerHubConnection.lastWorkerResultSource}` : ""
          }`
        : "No worker result recorded yet",
    },
  ];
  const nextTimelineStep = connectionTimeline.find((step) => !step.complete) || null;
  const visibleTimeline =
    connectionTimeline.filter((step) => step.complete).concat(activeDisneyJob && nextTimelineStep ? [nextTimelineStep] : []);
  const showPairingSection = !activeLocalDevice || Boolean(pairToken);
  const shouldShowDiagnostics =
    hasTerminalFailure ||
    activeDisneyJob ||
    Boolean(plannerHubConnection.lastQueuedJobId || plannerHubConnection.lastClaimedJobId || plannerHubConnection.lastReportedJobId);
  const showExpandedTimeline = activeDisneyJob || hasTerminalFailure;
  const summarizedActionMessage =
    plannerHubConnection.lastRequiredActionMessage &&
    plannerHubConnection.lastRequiredActionMessage !== latestWorkerMessage &&
    !plannerHubConnection.lastRequiredActionMessage.includes("claim this Disney connect job")
      ? plannerHubConnection.lastRequiredActionMessage
      : "";

  function stampVerification(patch: Partial<ReservationAssistState>) {
    onReservationAssistChange({
      ...patch,
      lastVerifiedAt: new Date().toISOString(),
    });
  }

  function launchVerification(url: string) {
    const now = new Date().toISOString();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        HANDOFF_STORAGE_KEY,
        JSON.stringify({
          lastHandoffAt: now,
          lastHandoffTargetLabel: currentTarget ? formatWatchDate(currentTarget.date) : "Disney verification",
        })
      );
    }

    onReservationAssistChange({
      sessionStatus: "checking",
      lastHandoffAt: now,
      lastHandoffTargetLabel: currentTarget ? formatWatchDate(currentTarget.date) : "Disney verification",
      lastHandoffOutcome: "",
      lastVerifiedFlowNote: `Opened Disney verification via ${url.includes("select-party") ? "select-party" : "profile/login"}.`,
      plannerHubEmail: disneyEmail,
    });

    window.location.assign(url);
  }

  function handleCheckpoint(outcome: ReservationHandoffOutcome) {
    const action = resultActions.find((item) => item.outcome === outcome);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
    }

    onReservationAssistChange({
      sessionStatus: outcome === "needed_login" ? "needs_login" : outcome === "flow_changed" ? "unknown" : "connected",
      lastHandoffOutcome: outcome,
      lastVerifiedFlowNote: action?.note || reservationAssist.lastVerifiedFlowNote,
      lastVerifiedAt: new Date().toISOString(),
      partyProofCaptured: outcome === "worked" ? true : outcome === "party_mismatch" ? false : reservationAssist.partyProofCaptured,
      flowProofCaptured: outcome === "worked" ? true : outcome === "flow_changed" || outcome === "party_mismatch" ? false : reservationAssist.flowProofCaptured,
      confirmProofCaptured: outcome === "worked" ? reservationAssist.confirmProofCaptured : outcome === "flow_changed" || outcome === "party_mismatch" ? false : reservationAssist.confirmProofCaptured,
      plannerHubEmail: disneyEmail,
      stepTwoVerified: outcome === "worked" ? reservationAssist.stepTwoVerified : false,
    });
  }

  async function handleConnectSubmit() {
    if (!disneyEmail.trim()) return;
    setIsConnecting(true);
    try {
      const normalizedEmail = disneyEmail.trim().toLowerCase();
      onReservationAssistChange({ plannerHubEmail: normalizedEmail, plannerHubConfirmed: true });
      const queued = await onConnectDisney(normalizedEmail, password);

      if (queued) {
        onPlannerHubConnectionChange({
          disneyEmail: normalizedEmail,
          status: "pending_connect",
          lastQueuedJobId: typeof queued === "string" ? queued : plannerHubConnection.lastQueuedJobId,
          lastRequiredActionMessage: password
            ? "Waiting for the active local Mac to claim this Disney connect job and capture the planner session."
            : "Waiting for the active local Mac to claim this Disney connect job using its local Disney session.",
          lastAuthFailureReason: "",
        });
        setPassword("");
        return;
      }

      onPlannerHubConnectionChange({
        disneyEmail: normalizedEmail,
        status: "failed",
        lastRequiredActionMessage: "",
      });
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleCreatePairToken() {
    setIsCreatingPairToken(true);
    try {
      const next = await onCreateLocalWorkerPairToken(pairDeviceName.trim() || "My Mac");
      if (typeof next === "string" && next) {
        setPairToken(next);
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(next).catch(() => undefined);
        }
      }
    } finally {
      setIsCreatingPairToken(false);
    }
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      await onImportConnectedMembers();
    } finally {
      setIsImporting(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await onRefreshDisneyStatus();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleReset() {
    setIsResetting(true);
    try {
      const reset = await onResetDisneyConnection();
      if (reset) {
        setPassword("");
      }
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">Reserve</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Connect the real Disney planner hub, import the connected party from Disney's live select-party page, and choose the eligible imported Magic Key members each watched date should target.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Connection</div>
              <h3 className="mt-2 text-xl font-semibold text-zinc-900">Disney-connected planner hub</h3>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${currentConnectionMeta.tone}`}>
              {currentConnectionMeta.label}
            </div>
          </div>

          <div className={`mt-4 rounded-[24px] border px-4 py-4 ${currentConnectionMeta.tone}`}>
            <p className="text-sm leading-6">{currentConnectionMeta.helper}</p>
            <p className="mt-2 text-xs font-medium text-zinc-600">
              {plannerHubConnection.latestJobUpdatedAt
                ? `Last backend update ${formatSyncTime(plannerHubConnection.latestJobUpdatedAt)}`
                : "Waiting for the next Disney worker update."}
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-700">{latestWorkerMessage}</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Active local device</div>
              <p className="mt-2 leading-6">
                {activeLocalDevice
                  ? `${activeLocalDevice.deviceName} • ${activeLocalDevice.platform} • last seen ${formatSyncTime(
                      activeLocalDevice.lastSeenAt || activeLocalDevice.lastCheckInAt
                    )}`
                  : "No local Disney worker has checked in yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Local Disney profile</div>
              <p className="mt-2 leading-6">
                {plannerHubConnection.hasLocalSession
                  ? "This account has a live Disney session on the active local device."
                  : "No device-local Disney session has been confirmed yet."}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-zinc-900">Disney connection progress</div>
              <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">
                {activeDisneyJob
                  ? "Live polling"
                  : plannerHubConnection.latestJobUpdatedAt
                    ? `Updated ${formatSyncTime(plannerHubConnection.latestJobUpdatedAt)}`
                    : "No active Disney job"}
              </div>
            </div>
            {showExpandedTimeline && visibleTimeline.length > 0 ? (
              <div className="mt-3 space-y-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                {visibleTimeline.map((step) => {
                  const isCurrent = !step.complete && nextTimelineStep?.phase === step.phase;
                  return (
                  <div key={step.phase} className="flex items-start gap-3">
                    <div
                      className={classNames(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        step.complete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : isCurrent
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-zinc-200 bg-white text-zinc-400"
                      )}
                    >
                      {step.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </div>
                    <div>
                      <div className="font-medium text-zinc-900">{step.label}</div>
                      <p className="mt-1 leading-6 text-zinc-600">
                        {step.complete
                          ? `${formatSyncTime(step.at)} • ${step.message}`
                          : activeDisneyJob
                            ? "This is the next live step."
                            : "Waiting for the next connect attempt."}
                      </p>
                    </div>
                  </div>
                  );
                })}
                {hasTerminalFailure && (failureEvent || latestFailureMessage) && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="font-semibold">Failure / pause reason</div>
                    <p className="mt-2 leading-6">
                      {failureEvent?.message || latestFailureMessage || "The Disney worker failed closed."}
                    </p>
                  </div>
                )}
              </div>
            ) : effectiveConnectionStatus === "connected" ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-white px-4 py-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">Connected and ready</div>
                <p className="mt-2 leading-6">
                  The active Mac has a working Disney session. Import connected members whenever you want to refresh the party, then choose who each watched date should target.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    {magicKeyMembers.length} Magic Key {magicKeyMembers.length === 1 ? "member" : "members"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    {ticketHolders.length} ticket {ticketHolders.length === 1 ? "holder" : "holders"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm leading-6 text-zinc-600">
                No Disney connect attempt is in flight right now. Pair the Mac once, then use the connect button when you want the local worker to take over.
              </div>
            )}
            {shouldShowDiagnostics && (
              <details className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Worker details</summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {correlationRows.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{row.label}</div>
                      <div className="mt-1 break-all text-sm font-medium text-zinc-900">{row.value}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {!sessionUser && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Sign in first to unlock the Disney connection flow and keep the planner hub, imported members, and booking targets tied to your account.
            </div>
          )}

          {sessionUser && (
            <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700" open={showPairingSection}>
              <summary className="cursor-pointer list-none font-semibold text-zinc-900">
                {activeLocalDevice ? "Pair or switch local Mac" : "Pair a local Mac"}
              </summary>
              <p className="mt-2 leading-6">
                Generate a pairing payload once, paste it into the local macOS worker app, and that Mac can start claiming Disney jobs for this account.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleCreatePairToken()}
                  disabled={isCreatingPairToken}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-violet-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isCreatingPairToken ? "Creating token..." : "Create local pair token"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
                <label className="space-y-2">
                  <span className="font-medium text-zinc-700">Device name</span>
                  <input
                    type="text"
                    value={pairDeviceName}
                    onChange={(event) => setPairDeviceName(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="font-medium text-zinc-700">Pairing payload</span>
                  <textarea
                    value={pairToken}
                    readOnly
                    rows={4}
                    placeholder="Generate this once, then paste it into the local macOS worker app."
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
                  />
                </label>
              </div>
            </details>
          )}

          <div className="mt-4 grid gap-3">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-zinc-700">Disney hub email</span>
              <input
                type="email"
                value={disneyEmail}
                onChange={(event) => {
                  setDisneyEmail(event.target.value);
                  onPlannerHubConnectionChange({ disneyEmail: event.target.value });
                  onReservationAssistChange({ plannerHubEmail: event.target.value });
                }}
                disabled={!sessionUser}
                placeholder={sessionUser?.email ?? "Sign in to connect your Disney planner hub"}
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-zinc-700">One-time Disney password handoff</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!sessionUser}
                placeholder="Optional: hand off a password once, or leave blank and use the local Disney session on your active Mac"
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleConnectSubmit()}
              disabled={!sessionUser || isConnecting || !disneyEmail.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {isConnecting ? "Queueing Disney connect..." : "Connect Disney on active Mac"}
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!sessionUser || isImporting || plannerHubConnection.status !== "connected"}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-violet-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Users className="h-4 w-4" />
              {isImporting ? "Queueing import..." : "Import connected members"}
            </button>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={!sessionUser || isRefreshing}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-violet-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {isRefreshing ? "Refreshing..." : "Refresh status"}
            </button>
            {(effectiveConnectionStatus === "pending_connect" ||
              effectiveConnectionStatus === "importing" ||
              effectiveConnectionStatus === "failed" ||
              effectiveConnectionStatus === "paused_login" ||
              effectiveConnectionStatus === "paused_mismatch") && (
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={!sessionUser || isResetting}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AlertTriangle className="h-4 w-4" />
                {isResetting ? "Resetting..." : "Reset Disney connection"}
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Encrypted session</div>
              <p className="mt-2 leading-6">
                {plannerHubConnection.hasLocalSession || plannerHubConnection.hasEncryptedSession
                  ? "A working Disney session has been confirmed for this planner hub."
                  : "No Disney session has been confirmed yet for the active local device."}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Imported members</div>
              <p className="mt-2 leading-6">
                {plannerHubConnection.importedMemberCount > 0
                  ? `${plannerHubConnection.importedMemberCount} connected Disney members imported.`
                  : "No connected members imported yet."}
              </p>
            </div>
          </div>

          {(summarizedActionMessage || plannerHubConnection.lastAuthFailureReason) && (
            <div className="mt-4 space-y-3">
              {summarizedActionMessage && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-900">Action needed</div>
                  <p className="mt-2 leading-6">{summarizedActionMessage}</p>
                  {effectiveConnectionStatus === "pending_connect" && !latestDisneyJob?.startedAt && (
                    <p className="mt-2 leading-6 text-zinc-500">
                      The Disney worker service has not started this planner-hub job yet. If this stays queued, check the dedicated worker service rather than the background scheduler.
                    </p>
                  )}
                </div>
              )}
              {plannerHubConnection.lastAuthFailureReason && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
                  <div className="font-semibold">Last auth failure</div>
                  <p className="mt-2 leading-6">{plannerHubConnection.lastAuthFailureReason}</p>
                </div>
              )}
            </div>
          )}

          <details className="mt-6 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
            <summary className="cursor-pointer list-none text-base font-semibold text-zinc-900">Verification notes</summary>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">Same-tab Disney proof</div>
                <p className="mt-2 leading-6">
                  Keep this for live proof runs. It verifies that Disney still shows the correct connected members and confirm path without pretending the website owns Disney login.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => launchVerification(reservationAssist.sessionStatus === "needs_login" || reservationAssist.sessionStatus === "expired" ? DISNEY_PROFILE_URL : DISNEY_SELECT_PARTY_URL)}
                    className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {reservationAssist.sessionStatus === "needs_login" || reservationAssist.sessionStatus === "expired"
                      ? "Recover Disney login"
                      : "Open live Disney verification"}
                  </button>
                  <a
                    href={DISNEY_SELECT_PARTY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-violet-200 hover:text-violet-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Disney select-party
                  </a>
                </div>
              </div>

              {showCheckpoint && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
                  <div className="font-semibold">What happened in Disney?</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resultActions.map((action) => (
                      <button
                        key={action.outcome}
                        type="button"
                        onClick={() => handleCheckpoint(action.outcome)}
                        className="rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition hover:border-sky-300"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={reservationAssist.plannerHubConfirmed}
                    onChange={(event) => stampVerification({ plannerHubConfirmed: event.target.checked, stepTwoVerified: false })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>Planner hub identity is locked.</span>
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={reservationAssist.partyProofCaptured}
                    onChange={(event) => stampVerification({ partyProofCaptured: event.target.checked, stepTwoVerified: false })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>The correct connected members appeared on Disney's select-party screen.</span>
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={reservationAssist.flowProofCaptured}
                    onChange={(event) => stampVerification({ flowProofCaptured: event.target.checked, stepTwoVerified: false })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>The shared party calendar and park path stayed stable.</span>
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={reservationAssist.confirmProofCaptured}
                    onChange={(event) => stampVerification({ confirmProofCaptured: event.target.checked, stepTwoVerified: false })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>The final Disney confirm screen matched the intended reservation target.</span>
                </label>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-zinc-900">Step 2 sign-off</div>
                    <p className="mt-1 leading-6">{verificationProgress}/4 verification checks complete.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => stampVerification({ stepTwoVerified: true })}
                    disabled={verificationProgress < 4}
                    className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark Step 2 verified
                  </button>
                </div>
              </div>
            </div>
          </details>
        </section>

        <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Booking</div>
              <h3 className="mt-2 text-xl font-semibold text-zinc-900">Imported connected members</h3>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${currentBookingMeta.tone}`}>
              {currentBookingMeta.label}
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Magic Key members are the only automatable members in this phase. Ticket holders stay visible so the connected Disney party is still truthful, but they are not selectable for automated booking yet.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
              {magicKeyMembers.length} Magic Key {magicKeyMembers.length === 1 ? "member" : "members"}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
              {ticketHolders.length} ticket {ticketHolders.length === 1 ? "holder" : "holders"}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <div className="text-sm font-semibold text-zinc-900">Magic Key members</div>
              <div className="mt-3 space-y-3">
                {magicKeyMembers.length === 0 ? (
                  <p className="text-sm text-zinc-500">No imported Magic Key members yet.</p>
                ) : (
                  magicKeyMembers.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                      <div className="font-semibold text-zinc-900">{member.displayName}</div>
                      <div className="mt-1 text-zinc-500">{member.passLabel || member.entitlementLabel}</div>
                      {member.rawEligibilityText && <div className="mt-1 text-zinc-500">{member.rawEligibilityText}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <div className="text-sm font-semibold text-zinc-900">Ticket holders</div>
              <div className="mt-3 space-y-3">
                {ticketHolders.length === 0 ? (
                  <p className="text-sm text-zinc-500">No imported ticket holders yet.</p>
                ) : (
                  ticketHolders.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                      <div className="font-semibold text-zinc-900">{member.displayName}</div>
                      <div className="mt-1 text-zinc-500">{member.passLabel || member.entitlementLabel}</div>
                      <div className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                        Visible only in v1
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Watch target</div>
            {watchItems.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">Add a watched date first, then choose the imported Disney members who should be targeted for that date.</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-zinc-700">Watched date</span>
                    <select
                      value={currentTarget?.id ?? ""}
                      onChange={(event) => setTargetWatchId(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-300"
                    >
                      {watchItems.map((item) => {
                        const passName = PASS_TYPES.find((pass) => pass.id === item.passType)?.name ?? item.passType;
                        return (
                          <option key={item.id} value={item.id}>
                            {formatWatchDate(item.date)} · {passName}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={plannerHubBooking.enabled}
                      onChange={(event) => onPlannerHubBookingChange({ enabled: event.target.checked, lastAttemptedAt: event.target.checked ? new Date().toISOString() : plannerHubBooking.lastAttemptedAt })}
                      className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>Enable booking foundation</span>
                  </label>
                </div>

                {currentTarget && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
                      <div className="font-semibold text-zinc-900">Eligible imported Magic Key members for {formatWatchDate(currentTarget.date)}</div>
                      <p className="mt-2 leading-6">
                        Eligibility here means the imported Disney member is not blocked out for the watched date. If you select members with different access, Disney will collapse the party to the narrower shared calendar.
                      </p>
                    </div>

                    {eligibleMembers.length === 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        No imported Magic Key members are currently eligible for this watched date.
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {eligibleMembers.map((member) => {
                          const selected = currentTarget.selectedImportedMemberIds.includes(member.id);
                          const eligibility = summarizeEligibility(member, currentTarget, lookup);
                          return (
                            <label key={member.id} className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) => {
                                  const nextIds = event.target.checked
                                    ? [...currentTarget.selectedImportedMemberIds, member.id]
                                    : currentTarget.selectedImportedMemberIds.filter((id) => id !== member.id);
                                  onWatchItemBookingChange(currentTarget.id, {
                                    plannerHubId: plannerHubConnection.plannerHubId || "primary",
                                    selectedImportedMemberIds: nextIds,
                                  });
                                }}
                                className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span>
                                <span className="block font-semibold text-zinc-900">{member.displayName}</span>
                                <span className="mt-1 block text-zinc-500">{member.passLabel}</span>
                                <span className="mt-1 block text-zinc-500">
                                  {eligibility.status === "either"
                                    ? "Eligible for either park"
                                    : eligibility.status === "dl"
                                      ? "Eligible for Disneyland Park"
                                      : eligibility.status === "dca"
                                        ? "Eligible for Disney California Adventure"
                                        : "Unavailable"}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {([
                        ["watch_only", "Watch only"],
                        ["watch_and_attempt", "Watch + attempt booking"],
                      ] as const).map(([mode, label]) => {
                        const selected = currentTarget.bookingMode === mode;
                        const disabled = mode === "watch_and_attempt" && !canArmCurrentTarget;
                        return (
                          <button
                            key={mode}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              onWatchItemBookingChange(currentTarget.id, {
                                plannerHubId: plannerHubConnection.plannerHubId || "primary",
                                bookingMode: mode,
                              })
                            }
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              selected
                                ? "border-violet-300 bg-violet-50 text-violet-900"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-violet-200"
                            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {!canArmCurrentTarget && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        To arm this watched date, connect Disney, import the connected party, select at least one eligible Magic Key member, and finish the Step 2 sign-off.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className={`rounded-2xl border px-4 py-4 text-sm ${currentBookingMeta.tone}`}>
              <div className="font-semibold">Booking state</div>
              <p className="mt-2 leading-6">{plannerHubBooking.lastResultMessage || "No booking result yet."}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Required action</div>
              <p className="mt-2 leading-6">{plannerHubBooking.lastRequiredActionMessage || "No action required yet."}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <span>
                Disney passwords are only used for the one-time worker handoff. The app keeps encrypted session state, not the password itself. If Disney expires the session or asks for a one-time code later, booking pauses and asks you to reconnect.
              </span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
