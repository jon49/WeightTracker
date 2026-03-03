import { SharedApp } from "./server/shared.global.ts";
import { SettingsApp } from "./settings.global.ts";

declare global {
  interface Window {
    sw: App;
  }
}

export interface App extends SettingsApp, SharedApp { }
