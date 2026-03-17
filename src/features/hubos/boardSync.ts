export const shouldApplyHubOrdersResponse = (
  requestId: number,
  latestRequestId: number
) => requestId === latestRequestId;

type TimerId = ReturnType<typeof setTimeout>;

type TimerApi = {
  setTimeout: (callback: () => void, timeoutMs: number) => TimerId;
  clearTimeout: (timerId: TimerId) => void;
};

type CoalescedRefetchSchedulerOptions = {
  delayMs?: number;
  timerApi?: TimerApi;
};

export const createCoalescedRefetchScheduler = (
  refetch: () => void,
  options: CoalescedRefetchSchedulerOptions = {}
) => {
  const delayMs = options.delayMs ?? 180;
  const timerApi = options.timerApi ?? globalThis;
  let timerId: TimerId | null = null;

  const schedule = () => {
    if (timerId !== null) {
      timerApi.clearTimeout(timerId);
    }

    timerId = timerApi.setTimeout(() => {
      timerId = null;
      refetch();
    }, delayMs);
  };

  const cancel = () => {
    if (timerId === null) return;
    timerApi.clearTimeout(timerId);
    timerId = null;
  };

  return {
    schedule,
    cancel,
  };
};

export const shouldRefreshOnVisibility = (visibilityState: DocumentVisibilityState) =>
  visibilityState === "visible";


type RealtimeChannelStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | "JOINING"
  | "LEAVING";

export const isRealtimeChannelHealthy = (
  status: RealtimeChannelStatus
) => status === "SUBSCRIBED";

export const shouldRunRecoverySync = ({
  isSubscribed,
  isOnline,
  visibilityState,
}: {
  isSubscribed: boolean;
  isOnline: boolean;
  visibilityState: DocumentVisibilityState;
}) => !isSubscribed && isOnline && shouldRefreshOnVisibility(visibilityState);


export const shouldRunSafetySync = ({
  isOnline,
  visibilityState,
  elapsedMsSinceLastSync,
  maxStalenessMs,
}: {
  isOnline: boolean;
  visibilityState: DocumentVisibilityState;
  elapsedMsSinceLastSync: number;
  maxStalenessMs: number;
}) =>
  isOnline &&
  shouldRefreshOnVisibility(visibilityState) &&
  elapsedMsSinceLastSync >= maxStalenessMs;
