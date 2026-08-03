import {
  EXCALICAP_EXTENSION,
  EXCALICAP_VIEW_TYPE,
  registerExcalicapView,
} from "./registration";

describe("registerExcalicapView", () => {
  it("maps .excalicap files to the Excalicap view", () => {
    const registerView = vi.fn();
    const registerExtensions = vi.fn();
    const createView = vi.fn();

    registerExcalicapView({ registerView, registerExtensions }, createView);

    expect(registerView).toHaveBeenCalledWith(
      EXCALICAP_VIEW_TYPE,
      createView,
    );
    expect(registerExtensions).toHaveBeenCalledWith(
      [EXCALICAP_EXTENSION],
      EXCALICAP_VIEW_TYPE,
    );
  });
});
