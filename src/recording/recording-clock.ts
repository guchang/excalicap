export type RecordingClockState =
  | "idle"
  | "recording"
  | "paused"
  | "stopped";

export class RecordingClock {
  private currentState: RecordingClockState = "idle";
  private segmentStartedAt = 0;
  private completedMilliseconds = 0;

  public get state() {
    return this.currentState;
  }

  public start(now: number) {
    this.requireState("idle", "开始");
    this.segmentStartedAt = now;
    this.completedMilliseconds = 0;
    this.currentState = "recording";
  }

  public pause(now: number) {
    this.requireState("recording", "暂停");
    this.completedMilliseconds += Math.max(0, now - this.segmentStartedAt);
    this.currentState = "paused";
  }

  public resume(now: number) {
    this.requireState("paused", "继续");
    this.segmentStartedAt = now;
    this.currentState = "recording";
  }

  public stop(now: number) {
    if (this.currentState === "recording") {
      this.completedMilliseconds += Math.max(0, now - this.segmentStartedAt);
    } else if (this.currentState !== "paused") {
      throw new Error(`无法在 ${this.currentState} 状态停止录制计时`);
    }
    this.currentState = "stopped";
    return this.completedMilliseconds;
  }

  public elapsed(now: number) {
    return this.currentState === "recording"
      ? this.completedMilliseconds + Math.max(0, now - this.segmentStartedAt)
      : this.completedMilliseconds;
  }

  private requireState(
    expected: RecordingClockState,
    action: "开始" | "暂停" | "继续",
  ) {
    if (this.currentState !== expected) {
      throw new Error(`无法在 ${this.currentState} 状态${action}录制计时`);
    }
  }
}

export function formatRecordingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteText = String(minutes).padStart(2, "0");
  const secondText = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`;
}
