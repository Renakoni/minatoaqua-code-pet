/// <reference types="vite/client" />

interface Window {
  petAPI?: {
    onPetEvent: (callback: (event: import("./shared/events").PetEvent) => void) => () => void;
  };
}
