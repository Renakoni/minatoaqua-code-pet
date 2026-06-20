import { contextBridge, ipcRenderer } from "electron";
import { PetEvent } from "../shared/events";

contextBridge.exposeInMainWorld("petAPI", {
  onPetEvent(callback: (event: PetEvent) => void) {
    const listener = (_: Electron.IpcRendererEvent, event: PetEvent) => callback(event);
    ipcRenderer.on("pet-event", listener);
    return () => ipcRenderer.removeListener("pet-event", listener);
  }
});
