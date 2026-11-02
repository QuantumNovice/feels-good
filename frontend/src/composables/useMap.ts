import L from 'leaflet';
import { mapCandidates, MARKER_LIMIT, type Spot } from '../state';
import type { Viewport } from '../services/places';
import { inKoreaExtract } from '../services/geography';

/** Owns Leaflet resources. Maps/markers are deliberately not made Vue reactive. */
export function createMap(
  element: HTMLElement,
  onMove: (view: Viewport) => void,
  onSelect: (place: Spot) => void,
) {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = L.map(element, {
    renderer: L.canvas({ padding: 0.1 }),
    zoomControl: false,
  }).setView([37.5665, 126.978], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    keepBuffer: 1,
    updateWhenIdle: true,
  }).addTo(map);
  const circles = new Map<string, { place: Spot; marker: L.CircleMarker }>(),
    widgets = new Map<string, L.Marker>();
  let draft: L.Marker | undefined,
    location: L.CircleMarker | undefined,
    moveTimer: ReturnType<typeof setTimeout> | undefined;
  const viewport = (): Viewport => {
    const b = map.getBounds(),
      c = map.getCenter();
    return {
      south: b.getSouth(),
      north: b.getNorth(),
      west: b.getWest(),
      east: b.getEast(),
      latitude: c.lat,
      longitude: c.lng,
      zoom: map.getZoom(),
    };
  };
  const move = () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!draft && !document.hidden) onMove(viewport());
    }, 180);
  };
  map.on('moveend', move);
  map.on('click', (event: L.LeafletMouseEvent) =>
    draft?.setLatLng(event.latlng),
  );
  const observer = new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    move();
  });
  observer.observe(element);
  let paintedCategory = 'all';
  function center(place: Pick<Spot, 'latitude' | 'longitude'>, zoom?: number) {
    map.stop();
    if (zoom === undefined)
      map.panTo([place.latitude, place.longitude], {
        animate: !reduced(),
        duration: 0.45,
      });
    else
      map.setView([place.latitude, place.longitude], zoom, {
        animate: !reduced(),
      });
  }
  function paint(
    places: Spot[],
    label: (place: Spot) => string,
    category = 'all',
  ) {
    if (document.hidden) return;
    if (category !== paintedCategory) {
      for (const marker of widgets.values()) marker.remove();
      widgets.clear();
      paintedCategory = category;
    }
    const wanted = new Set<string>(),
      photos = new Set<string>(),
      positions: L.Point[] = [];
    for (const place of mapCandidates(places)) {
      if (wanted.size >= MARKER_LIMIT) break;
      if (!map.getBounds().contains([place.latitude, place.longitude]))
        continue;
      wanted.add(place.id);
      const old = circles.get(place.id);
      if (old && old.place !== place) {
        widgets.get(place.id)?.remove();
        widgets.delete(place.id);
      }
      if (old?.place !== place) {
        old?.marker.remove();
        const marker = L.circleMarker([place.latitude, place.longitude], {
          radius: 6,
          color: '#fff',
          weight: 2,
          fillColor: '#222',
          fillOpacity: 1,
          interactive: true,
        })
          .addTo(map)
          .bindTooltip(() => {
            const span = document.createElement('span');
            span.textContent = label(place);
            return span;
          })
          .on('click', () => onSelect(place));
        circles.set(place.id, { place, marker });
      }
      const position = map.latLngToContainerPoint([
        place.latitude,
        place.longitude,
      ]);
      if (
        photos.size >= 24 ||
        positions.some((other) => other.distanceTo(position) < 80)
      )
        continue;
      photos.add(place.id);
      positions.push(position);
      const existing = widgets.get(place.id);
      if (existing) {
        existing.getElement()?.setAttribute('title', label(place));
        existing.getElement()?.setAttribute('aria-label', label(place));
        continue;
      }
      const widget = document.createElement('div');
      widget.className = 'map-widget';
      const image = document.createElement('img');
      const iconCategory = place.layers?.includes(category)
        ? category
        : place.category;
      image.src =
        (category !== 'bathroom' && place.image) ||
        new URL('./icons/' + iconCategory + '.svg', document.baseURI).href;
      image.alt = '';
      image.width = 40;
      image.height = 40;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => {
        image.onerror = null;
        image.src = new URL(
          './icons/' + iconCategory + '.svg',
          document.baseURI,
        ).href;
      };
      widget.append(image);
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          html: widget,
          className: 'picture-marker',
          iconSize: [60, 68],
          iconAnchor: [30, 64],
        }),
        title: label(place),
        keyboard: true,
        zIndexOffset: 500,
      })
        .addTo(map)
        .on('click', () => onSelect(place));
      widgets.set(place.id, marker);
    }
    for (const [id, entry] of circles)
      if (!wanted.has(id)) {
        entry.marker.remove();
        circles.delete(id);
      }
    for (const [id, marker] of widgets)
      if (!photos.has(id)) {
        marker.remove();
        widgets.delete(id);
      }
  }
  function startPin(place?: Spot) {
    draft?.remove();
    draft = L.marker(
      place ? [place.latitude, place.longitude] : map.getCenter(),
      { draggable: true },
    ).addTo(map);
  }
  function finishPin() {
    const position = draft?.getLatLng();
    draft?.remove();
    draft = undefined;
    return position;
  }
  function locate(latitude: number, longitude: number) {
    location?.remove();
    location = L.circleMarker([latitude, longitude], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
    }).addTo(map);
    // Fixes outside the bundled Korea data (e.g. an emulator's default California fix)
    // would leave an empty map, so keep the current view, which starts on Seoul.
    if (inKoreaExtract({ latitude, longitude })) center({ latitude, longitude }, 16);
  }
  function destroy() {
    clearTimeout(moveTimer);
    observer.disconnect();
    map.remove();
    circles.clear();
    widgets.clear();
  }
  const zoom = (step: number) => map.setZoom(map.getZoom() + step);
  return {
    center,
    paint,
    viewport,
    startPin,
    finishPin,
    locate,
    destroy,
    zoom,
  };
}
