import { SharedApp } from "./server/shared.global.ts"
import { SettingsApp } from "./settings.global.ts"

declare global {
    interface Window {
        app: App
    }
}

export interface App extends SettingsApp, SharedApp {}

