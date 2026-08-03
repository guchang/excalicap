export interface LatestRenderCoordinator<T> {
  run(
    render: () => Promise<T>,
    commit: (value: T) => void,
  ): Promise<boolean>;
  invalidate(): void;
}

export function createLatestRenderCoordinator<T>(): LatestRenderCoordinator<T> {
  let latestRequest = 0;

  return {
    async run(render, commit) {
      const request = ++latestRequest;
      const value = await render();
      if (request !== latestRequest) {
        return false;
      }
      commit(value);
      return true;
    },
    invalidate() {
      latestRequest += 1;
    },
  };
}
