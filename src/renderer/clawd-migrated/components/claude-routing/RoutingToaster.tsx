import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";

function readTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * Sonner toaster configured like cc-switch's (position top-center,
 * richColors, 2s default), with the theme following the app's
 * data-theme attribute. Portaled to <body> so ancestors with
 * backdrop-filter/transform cannot trap its fixed positioning.
 */
export function RoutingToaster() {
  const [theme, setTheme] = useState<"light" | "dark">(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return createPortal(
    <Toaster position="top-center" richColors theme={theme} toastOptions={{ duration: 2000 }} />,
    document.body
  );
}
