export const EXCALICAP_VIEW_TYPE = "excalicap-view";
export const EXCALICAP_EXTENSION = "excalicap";

interface ViewRegistrationPort<TView> {
  registerView(type: string, createView: (leaf: unknown) => TView): void;
  registerExtensions(extensions: string[], viewType: string): void;
}

export function registerExcalicapView<TView>(
  plugin: ViewRegistrationPort<TView>,
  createView: (leaf: unknown) => TView,
) {
  plugin.registerView(EXCALICAP_VIEW_TYPE, createView);
  plugin.registerExtensions([EXCALICAP_EXTENSION], EXCALICAP_VIEW_TYPE);
}
