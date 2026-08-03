import { createLatestRenderCoordinator } from "./latest-render";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("createLatestRenderCoordinator", () => {
  it("commits only the latest render when an older export finishes last", async () => {
    const coordinator = createLatestRenderCoordinator<string>();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];

    const firstRun = coordinator.run(
      () => first.promise,
      (value) => committed.push(value),
    );
    const secondRun = coordinator.run(
      () => second.promise,
      (value) => committed.push(value),
    );

    second.resolve("slide-3");
    await secondRun;
    first.resolve("slide-2");
    await firstRun;

    expect(committed).toEqual(["slide-3"]);
  });
});
