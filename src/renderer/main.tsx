import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const isPanelView = new URLSearchParams(window.location.search).get("view") === "panel";

async function render() {
  const root = createRoot(document.getElementById("root")!);

  if (isPanelView) {
    const [{ ClawdSettingsRoot }, { installClawdCompat }] = await Promise.all([
      import("./clawd-migrated/main"),
      import("./clawdCompat")
    ]);
    installClawdCompat();
    root.render(<ClawdSettingsRoot />);
    return;
  }

  await import("./styles.css");
  const { default: App } = await import("./App");
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void render();
