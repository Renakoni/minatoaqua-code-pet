// @ts-nocheck
/// <reference types="vite/client" />

import type { CompanionApi } from "../main/preload.cjs";

declare global {
  interface ViewTransition {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition: () => void;
  }

  interface Document {
    startViewTransition?: (callback: () => void) => ViewTransition;
  }

  interface Window {
    companion: CompanionApi;
  }
}

export {};

