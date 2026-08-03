import { RecordingClock, formatRecordingTime } from "./recording-clock";

describe("RecordingClock", () => {
  it("excludes paused time from the elapsed recording duration", () => {
    const clock = new RecordingClock();
    clock.start(0);
    clock.pause(10_000);
    clock.resume(130_000);

    expect(clock.stop(140_000)).toBe(20_000);
    expect(clock.elapsed(200_000)).toBe(20_000);
  });

  it("rejects invalid state transitions", () => {
    const clock = new RecordingClock();

    expect(() => clock.pause(100)).toThrow(
      "无法在 idle 状态暂停录制计时",
    );
    clock.start(0);
    expect(() => clock.start(1)).toThrow(
      "无法在 recording 状态开始录制计时",
    );
  });
});

describe("formatRecordingTime", () => {
  it("formats short and hour-long recordings", () => {
    expect(formatRecordingTime(0)).toBe("00:00");
    expect(formatRecordingTime(65_000)).toBe("01:05");
    expect(formatRecordingTime(3_723_000)).toBe("1:02:03");
  });
});
