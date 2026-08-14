import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../product/output-presets";
import { SettingsDialog } from "./SettingsDialog";

const renderDialog = () =>
  render(
    <SettingsDialog
      devices={{ cameras: [], microphones: [] }}
      open
      settings={DEFAULT_SETTINGS}
      onApply={() => undefined}
      onClose={() => undefined}
    />,
  );

describe("SettingsDialog controls", () => {
  it("renders canvas padding and Slide radius as separate full-width rows", () => {
    renderDialog();

    const padding = screen.getByRole("slider", { name: "画布留白" });
    const radius = screen.getByRole("slider", { name: "Slide 圆角" });

    expect(padding.closest(".range-setting")).not.toBe(
      radius.closest(".range-setting"),
    );
    expect(padding.closest(".settings-row")).toBeNull();
    expect(radius.closest(".settings-row")).toBeNull();
    expect(screen.getByLabelText("画布留白数值")).toHaveTextContent("24 px");
    expect(screen.getByLabelText("Slide 圆角数值")).toHaveTextContent(
      "18 px",
    );

    fireEvent.change(padding, { target: { value: "48" } });
    fireEvent.change(radius, { target: { value: "30" } });

    expect(screen.getByLabelText("画布留白数值")).toHaveTextContent("48 px");
    expect(screen.getByLabelText("Slide 圆角数值")).toHaveTextContent(
      "30 px",
    );
  });

  it("exposes boolean settings as pill switches", () => {
    renderDialog();

    for (const name of [
      "显示摄像头",
      "镜像画面",
      "录制麦克风",
      "显示光标",
    ]) {
      expect(screen.getByRole("switch", { name })).toHaveClass(
        "settings-switch",
      );
    }
  });
});
