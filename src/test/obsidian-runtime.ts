export class Plugin {}

export class TextFileView {
  data = "";
  file = { basename: "Project", name: "Project.excalicap" };
  app = {
    vault: { read: async () => this.data },
  };
  contentEl = {
    addClass: () => undefined,
    createDiv: () => document.createElement("div"),
    empty: () => undefined,
  };
  requestSave = () => undefined;

  constructor(public readonly leaf: unknown) {}

  async save() {}
  async onUnloadFile() {}
}

export class TFile {
  constructor(
    public basename: string,
    public name: string,
    public path: string,
    public extension: string,
  ) {}
}
export type WorkspaceLeaf = unknown;
