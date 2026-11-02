import type { VehicleSignals } from '../components/VehicleAmbience.vue';

/**
 * Development only: feeds car events from scripts/car-bridge.mjs into the same callbacks the Android app uses,
 * so the browser UI reacts to the emulator console or the keyboard car exactly as it does in the vehicle.
 */
export function connectCarBridge(url: string) {
  const source = new EventSource(url);
  source.onmessage = (event) => {
    const { driving, signals } = JSON.parse(event.data) as {
      driving: boolean;
      signals: VehicleSignals;
    };
    // App.vue registers the callbacks on mount; early events are simply resent by the next change.
    window.spotlaneDriving?.(driving);
    window.spotlaneVehicle?.(signals);
  };
  return source;
}
