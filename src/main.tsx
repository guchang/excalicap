import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import App from "./App";
import { ensureLibraryReturnTarget } from "./library/library-return-target";
import "./browser.css";
import "./styles.css";

ensureLibraryReturnTarget(window);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(<App />);
