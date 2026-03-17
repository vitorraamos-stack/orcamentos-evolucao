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
