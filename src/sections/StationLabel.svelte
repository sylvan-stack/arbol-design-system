<script module lang="ts">
  export const stationLabels = ['circle', 'diamond', 'triangle', 'square', 'pentagon', 'hexagon', 'cross', 'star'] as const;
  export type StationLabel = (typeof stationLabels)[number];

  export const stationLabelNames: Record<StationLabel, string> = {
    circle: 'Coral circle',
    diamond: 'Amber diamond',
    triangle: 'Lime triangle',
    square: 'Teal square',
    pentagon: 'Blue pentagon',
    hexagon: 'Violet hexagon',
    cross: 'Pink cross',
    star: 'Gold star',
  };

  export function isStationLabel(value: unknown): value is StationLabel {
    return stationLabels.some(label => label === value);
  }

  export function defaultStationLabel(chat: string): StationLabel {
    // FNV-1a keeps a pseudorandom default stable without writing every row to storage.
    let hash = 2166136261;
    for (let index = 0; index < chat.length; index++) {
      hash = Math.imul(hash ^ chat.charCodeAt(index), 16777619);
    }
    return stationLabels[Math.floor((hash >>> 0) / 2 ** 32 * stationLabels.length)];
  }
</script>

<script lang="ts">
  let { label }: { label: StationLabel } = $props();
</script>

<span class="shape" data-shape={label} aria-hidden="true"></span>

<style>
  .shape {
    display: inline-block;
    flex: none;
    width: var(--station-label-size, 12px);
    height: var(--station-label-size, 12px);
    background: currentColor;
    color: var(--label-color, var(--text));
  }
  [data-shape='circle'] {
    --label-color: light-dark(#a83c31, #ff9c90);
    border-radius: 50%;
  }
  [data-shape='diamond'] {
    --label-color: light-dark(#975114, #ffb765);
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }
  [data-shape='triangle'] {
    --label-color: light-dark(#536c16, #c2de78);
    clip-path: polygon(50% 4%, 100% 94%, 0 94%);
  }
  [data-shape='square'] {
    --label-color: light-dark(#197362, #79dbc1);
    border-radius: 1px;
  }
  [data-shape='pentagon'] {
    --label-color: light-dark(#285f9d, #91c5ff);
    clip-path: polygon(50% 0, 100% 38%, 81% 100%, 19% 100%, 0 38%);
  }
  [data-shape='hexagon'] {
    --label-color: light-dark(#6f469c, #c8a4ff);
    clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
  }
  [data-shape='cross'] {
    --label-color: light-dark(#a03673, #f4a2d7);
    clip-path: polygon(32% 0, 68% 0, 68% 32%, 100% 32%, 100% 68%, 68% 68%, 68% 100%, 32% 100%, 32% 68%, 0 68%, 0 32%, 32% 32%);
  }
  [data-shape='star'] {
    --label-color: light-dark(#846500, #fadb70);
    clip-path: polygon(50% 0, 65% 34%, 100% 38%, 74% 64%, 81% 100%, 50% 81%, 19% 100%, 26% 64%, 0 38%, 35% 34%);
  }
  @media (forced-colors: active) {
    .shape { forced-color-adjust: none; color: ButtonText; }
  }
</style>
