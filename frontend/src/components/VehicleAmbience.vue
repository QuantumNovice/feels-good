<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue';

/**
 * Passive cabin cues: edge light, a door glyph and a few soft chimes, never text, never input.
 * Each cue mirrors what the car itself does so the driver reads it at a glance without looking for it.
 */
export type VehicleSignals = {
  brake: boolean;
  turn: 'left' | 'right' | 'off';
  lowBeam: boolean;
  speedKph: number;
  acceleration: number;
  doors: Partial<Record<DoorName, true>>;
  /** Optional extras sent by the development car bridge; the Android app may omit them. */
  brakeLevel?: number;
  gear?: 'park' | 'reverse' | 'neutral' | 'drive';
  hazard?: boolean;
};
type DoorName = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight' | 'trunk';

const props = defineProps<{ signals: VehicleSignals }>();
const clamp = (value: number) => Math.min(1, Math.max(0, value));
// Hard braking is roughly 0.35 g; ordinary stops stay well under it.
const HARD_BRAKE = -3.5;
const MOVING_KPH = 3;
const hardBrake = ref(false);
const doorAlert = ref(false);
const shift = ref(0);
let hardBrakeTimer = 0;
let doorTimer = 0;

const style = computed(() => {
  const s = props.signals;
  const brake = s.brakeLevel ?? (s.brake ? 0.7 : 0);
  return {
    // Brake light grows with pedal pressure, like the glow of the car ahead.
    '--brake': brake > 0 ? 0.25 + brake * 0.55 : 0,
    // Gentle pull only above walking-pace changes so GPS jitter stays invisible.
    '--accel': brake > 0 ? 0 : clamp((s.acceleration - 0.4) / 2.6) * 0.4,
    '--speed': clamp(s.speedKph / 110) * 0.28,
  };
});
const open = computed(() => props.signals.doors);
const anyOpen = computed(() => Object.keys(open.value).length > 0);
const moving = computed(() => props.signals.speedKph > MOVING_KPH);
const turn = computed(() =>
  props.signals.hazard
    ? 'both'
    : props.signals.turn === 'off'
      ? undefined
      : props.signals.turn,
);
watchEffect(() =>
  document.documentElement.classList.toggle('vehicle-night', props.signals.lowBeam),
);

// Short sine chimes, quiet and rare: only for events the driver should not miss.
let audio: AudioContext | undefined;
function chime(notes: number[], volume = 0.05) {
  try {
    const context = (audio ??= new AudioContext());
    void context.resume();
    notes.forEach((frequency, i) => {
      const at = context.currentTime + i * 0.16;
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      tone.connect(gain).connect(context.destination);
      tone.start(at);
      tone.stop(at + 0.55);
    });
  } catch {
    // No audio output (or autoplay blocked): the light cues still carry the event.
  }
}

watch(
  () => props.signals.acceleration,
  (a) => {
    if (a > HARD_BRAKE || !moving.value) return;
    hardBrake.value = true;
    clearTimeout(hardBrakeTimer);
    hardBrakeTimer = window.setTimeout(() => (hardBrake.value = false), 900);
  },
);
watch(
  () => Object.keys(props.signals.doors).sort().join(),
  (now, before) => {
    const was = before.split(',');
    if (!now.split(',').some((door) => door && !was.includes(door))) return;
    // A door opening while rolling or in gear is a warning; at rest it is just a soft notice.
    const urgent = moving.value || (props.signals.gear ?? 'park') !== 'park';
    chime(urgent ? [880, 660, 880] : [660], urgent ? 0.08 : 0.035);
    if (!urgent) return;
    doorAlert.value = true;
    clearTimeout(doorTimer);
    doorTimer = window.setTimeout(() => (doorAlert.value = false), 2400);
  },
);
watch(
  () => props.signals.gear,
  (gear, before) => {
    if (!gear || !before || gear === before) return;
    shift.value++; // a new key restarts the acknowledgement sweep
    if (gear === 'reverse') chime([520], 0.04);
  },
);
onBeforeUnmount(() => {
  clearTimeout(hardBrakeTimer);
  clearTimeout(doorTimer);
  void audio?.close();
});
</script>

<template>
  <div class="vehicle-ambience" :style="style" aria-hidden="true">
    <div class="cue speed" />
    <div class="cue accel" />
    <div class="cue brake" :class="{ hard: hardBrake }" />
    <div v-if="signals.gear === 'reverse'" class="cue reverse" />
    <div v-if="turn" class="cue turn" :class="turn" />
    <div v-if="doorAlert" class="cue door-alert" />
    <div v-if="shift" :key="shift" class="cue shift" />
    <Transition name="glyph">
      <svg v-if="anyOpen" class="door-glyph" :class="{ alert: doorAlert }" viewBox="0 0 60 100">
        <rect class="body" x="14" y="8" width="32" height="84" rx="13" />
        <rect class="glass" x="19" y="26" width="22" height="14" rx="4" />
        <rect class="glass" x="19" y="64" width="22" height="10" rx="4" />
        <rect class="door" :class="{ open: open.frontLeft }" x="10" y="38" width="5" height="18" rx="2" />
        <rect class="door" :class="{ open: open.frontRight }" x="45" y="38" width="5" height="18" rx="2" />
        <rect class="door" :class="{ open: open.rearLeft }" x="10" y="58" width="5" height="16" rx="2" />
        <rect class="door" :class="{ open: open.rearRight }" x="45" y="58" width="5" height="16" rx="2" />
        <rect class="door" :class="{ open: open.trunk }" x="20" y="88" width="20" height="5" rx="2" />
      </svg>
    </Transition>
  </div>
</template>

<style scoped>
.vehicle-ambience {
  position: fixed;
  inset: 0;
  /* Above the driving lock (3000) so cues stay bright while controls are paused; never takes input. */
  z-index: 3100;
  pointer-events: none;
}
.cue {
  position: absolute;
  inset: 0;
  transition: opacity 0.35s ease-out;
}
/* Speed narrows attention slightly: a soft vignette that deepens toward highway speed. */
.speed {
  opacity: var(--speed);
  background: radial-gradient(ellipse at center, transparent 55%, rgb(4 8 14) 100%);
  transition-duration: 1.2s;
}
.accel {
  opacity: var(--accel);
  background: linear-gradient(to top, rgb(56 189 248 / 0.55), transparent 22%);
}
.brake {
  opacity: var(--brake);
  background: linear-gradient(to top, rgb(239 68 68 / 0.7), transparent 18%);
  transition-duration: 0.12s;
}
/* A hard stop flashes three times, like a car's emergency stop signal. */
.brake.hard {
  opacity: 1;
  background:
    linear-gradient(to top, rgb(239 68 68 / 0.8), transparent 24%),
    linear-gradient(to right, rgb(239 68 68 / 0.45), transparent 6%),
    linear-gradient(to left, rgb(239 68 68 / 0.45), transparent 6%);
  animation: hard-brake 0.3s steps(1, end) 3;
}
@keyframes hard-brake {
  50% {
    opacity: 0.2;
  }
}
/* Reversing lights: a cool white floor glow while the car is in reverse. */
.reverse {
  background: linear-gradient(to top, rgb(226 232 240 / 0.4), transparent 16%);
  animation: fade-in 0.4s ease-out;
}
/* Indicators blink at about 80 per minute, the rate drivers already know from the dashboard. */
.turn {
  animation: turn-blink 0.75s steps(1, end) infinite;
}
.turn.left {
  background: linear-gradient(to right, rgb(251 191 36 / 0.55), transparent 9%);
}
.turn.right {
  background: linear-gradient(to left, rgb(251 191 36 / 0.55), transparent 9%);
}
.turn.both {
  background:
    linear-gradient(to right, rgb(251 191 36 / 0.55), transparent 9%),
    linear-gradient(to left, rgb(251 191 36 / 0.55), transparent 9%);
}
@keyframes turn-blink {
  50% {
    opacity: 0.15;
  }
}
/* A door opened while moving or in gear: an amber frame pulse the driver catches peripherally. */
.door-alert {
  box-shadow: inset 0 0 0 6px rgb(251 191 36 / 0.75);
  animation: door-pulse 0.6s ease-in-out 4;
}
@keyframes door-pulse {
  50% {
    opacity: 0.25;
  }
}
/* Gear change acknowledgement: one faint sweep along the bottom edge. */
.shift {
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.22), transparent) bottom / 40% 3px
    no-repeat;
  animation: shift-sweep 0.7s ease-out forwards;
}
@keyframes shift-sweep {
  from {
    background-position: -40% 100%;
  }
  to {
    background-position: 140% 100%;
    opacity: 0;
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
.door-glyph {
  position: absolute;
  left: 24px;
  bottom: 24px;
  width: 44px;
  height: 74px;
  filter: drop-shadow(0 2px 6px rgb(0 0 0 / 0.45));
}
.door-glyph.alert {
  animation: door-pulse 0.6s ease-in-out 4;
}
.body {
  fill: rgb(20 24 31 / 0.82);
  stroke: rgb(255 255 255 / 0.35);
  stroke-width: 1.5;
}
.glass {
  fill: rgb(255 255 255 / 0.14);
}
.door {
  fill: rgb(255 255 255 / 0.25);
  transition: fill 0.3s;
}
.door.open {
  fill: #fbbf24;
}
.glyph-enter-active,
.glyph-leave-active {
  transition: opacity 0.4s;
}
.glyph-enter-from,
.glyph-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .cue {
    transition: none;
  }
  .turn,
  .brake.hard,
  .door-alert,
  .door-glyph.alert,
  .reverse {
    animation: none;
    opacity: 0.6;
  }
  .shift {
    display: none;
  }
}
:global(html.vehicle-night #map .leaflet-tile-pane) {
  filter: brightness(0.78) saturate(0.85);
  transition: filter 1.5s;
}
</style>
