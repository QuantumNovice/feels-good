/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_ENABLED?: string;
  readonly VITE_POSTHOG_CAPTURE_IN_DEV?: string;
  readonly VITE_CAR_BRIDGE?: string;
}
interface Window {
  Spotlane?: {
    state(): string;
    nearby?(view: string): string;
    savedPlaces?(): string;
    driving?(): boolean;
    action(action: string, payload: string): boolean;
    navigationApps(place: string): string;
  };
  spotlaneResult?: (ok: boolean, changed?: boolean) => void;
  spotlaneLocation?: (latitude: number, longitude: number) => void;
  spotlaneLocationError?: () => void;
  spotlaneDriving?: (driving: boolean) => void;
  spotlaneVehicle?: (signals: import('./components/VehicleAmbience.vue').VehicleSignals) => void;
}
