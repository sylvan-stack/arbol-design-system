import type { PhaseName } from '../sections/ExchangeDetails.svelte';

type Geometry = { cell: number; angle: number; offset: number; rule: number };
type Pattern = { name: string; layers: (geometry: Geometry) => string };

const ink = 'var(--pattern-ink)';
const soft = 'var(--pattern-soft)';
const clear = 'transparent';

const geometry: Record<PhaseName, Geometry> = {
  intake: { cell: 15, angle: 30, offset: 1, rule: -5 },
  planning: { cell: 21, angle: 43, offset: 4, rule: 2 },
  execution: { cell: 18, angle: 58, offset: 6, rule: 8 },
  finalization: { cell: 25, angle: 72, offset: 9, rule: 0 },
};

export const phaseColor: Record<PhaseName, string> = {
  intake: '#cba15e',
  planning: '#9b93db',
  execution: '#75b5d8',
  finalization: '#82be9c',
};

function tile(image: string, width: number, height = width, x = 0, y = 0): string {
  return `${image} ${x}px ${y}px / ${width}px ${height}px`;
}

function lines(angle: number, period: number, color = ink, width = 1): string {
  return `repeating-linear-gradient(${angle}deg, ${color} 0 ${width}px, ${clear} ${width}px ${period}px)`;
}

export const phasePatterns: readonly Pattern[] = [
  {
    name: 'Pin dots',
    layers: ({ cell }) => tile(`radial-gradient(circle, ${ink} 1px, ${clear} 1.5px)`, cell),
  },
  {
    name: 'Offset dots',
    layers: ({ cell, offset }) => [
      tile(`radial-gradient(circle, ${ink} 1.5px, ${clear} 2px)`, cell, cell),
      tile(`radial-gradient(circle, ${soft} 1px, ${clear} 1.5px)`, cell, cell, cell / 2, offset + 3),
    ].join(', '),
  },
  {
    name: 'Constellation',
    layers: ({ cell, offset }) => [
      tile(`radial-gradient(circle at 22% 25%, ${ink} 1.5px, ${clear} 2px)`, cell * 2),
      tile(`radial-gradient(circle at 65% 72%, ${soft} 2px, ${clear} 2.5px)`, cell * 2),
      tile(`radial-gradient(circle at 82% 33%, ${ink} .75px, ${clear} 1.25px)`, cell * 2, cell * 2, offset),
    ].join(', '),
  },
  {
    name: 'Ruled lines',
    layers: ({ cell, rule }) => lines(rule, cell),
  },
  {
    name: 'Diagonal hatch',
    layers: ({ cell, angle }) => lines(angle, cell * 0.65),
  },
  {
    name: 'Crosshatch',
    layers: ({ cell, angle }) => `${lines(angle, cell)}, ${lines(angle + 90, cell * 1.2, soft)}`,
  },
  {
    name: 'Paper grid',
    layers: ({ cell }) => `${lines(0, cell)}, ${lines(90, cell, soft)}`,
  },
  {
    name: 'Graph paper',
    layers: ({ cell }) =>
      [lines(0, cell * 2), lines(90, cell * 2), lines(0, cell / 2, soft), lines(90, cell / 2, soft)].join(', '),
  },
  {
    name: 'Dash rows',
    layers: ({ cell, offset }) =>
      tile(`radial-gradient(ellipse ${cell / 3}px 1px at 50% 50%, ${ink} 82%, ${clear} 100%)`,
        cell * 1.5, cell, offset),
  },
  {
    name: 'Dashed grid',
    layers: ({ cell, offset }) => [
      tile(`radial-gradient(ellipse 4px .9px at 50% 50%, ${ink} 82%, ${clear} 100%)`, cell),
      tile(`radial-gradient(ellipse .9px 4px at 50% 50%, ${soft} 82%, ${clear} 100%)`, cell, cell, offset + 4, cell / 2),
    ].join(', '),
  },
  {
    name: 'Checker',
    layers: ({ cell, offset }) =>
      tile(`conic-gradient(${soft} 25%, ${clear} 0 50%, ${soft} 0 75%, ${clear} 0)`, cell * 1.5, cell * 1.5, offset),
  },
  {
    name: 'Diamond windows',
    layers: ({ cell, offset }) => {
      const band = (angle: number) => `linear-gradient(${angle}deg, ${clear} 43%, ${ink} 43% 47%, ${clear} 47% 53%, ${ink} 53% 57%, ${clear} 57%)`;
      return `${tile(band(45), cell, cell, offset)}, ${tile(band(-45), cell, cell, offset)}`;
    },
  },
  {
    name: 'Chevrons',
    layers: ({ cell, offset }) => [
      tile(`linear-gradient(135deg, ${clear} 42%, ${ink} 43% 47%, ${clear} 48%)`, cell, cell, offset),
      tile(`linear-gradient(225deg, ${clear} 42%, ${ink} 43% 47%, ${clear} 48%)`, cell, cell, offset + cell / 2),
    ].join(', '),
  },
  {
    name: 'Herringbone',
    layers: ({ cell, offset }) => [
      tile(`linear-gradient(135deg, ${soft} 25%, ${clear} 0)`, cell, cell * 2, offset),
      tile(`linear-gradient(225deg, ${ink} 25%, ${clear} 0)`, cell, cell * 2, offset + cell / 2, cell / 2),
      tile(`linear-gradient(315deg, ${soft} 25%, ${clear} 0)`, cell, cell * 2, offset, cell),
    ].join(', '),
  },
  {
    name: 'Isometric mesh',
    layers: ({ cell, rule }) =>
      [lines(rule, cell * 1.15, soft), lines(rule + 60, cell * 1.15), lines(rule + 120, cell * 1.15, soft)].join(', '),
  },
  {
    name: 'Scallops',
    layers: ({ cell, offset }) => [
      tile(`radial-gradient(circle at 50% 100%, ${clear} 44%, ${ink} 45% 48%, ${clear} 49%)`, cell * 2, cell, offset),
      tile(`radial-gradient(circle at 50% 100%, ${clear} 44%, ${soft} 45% 48%, ${clear} 49%)`,
        cell * 2, cell, offset + cell, cell / 2),
    ].join(', '),
  },
  {
    name: 'Ripples',
    layers: ({ cell, offset }) =>
      tile(`radial-gradient(circle, ${clear} 18%, ${ink} 19% 22%, ${clear} 23% 32%, ${soft} 33% 36%, ${clear} 37%)`,
        cell * 1.8, cell * 1.8, offset),
  },
  {
    name: 'Contours',
    layers: ({ cell, offset }) =>
      `repeating-radial-gradient(ellipse at ${18 + offset * 4}% ${42 + offset * 3}%, ${clear} 0 ${cell}px, ${ink} ${cell}px ${cell + 1}px)`,
  },
  {
    name: 'Corner marks',
    layers: ({ cell, offset }) => [
      tile(`radial-gradient(ellipse 3.5px .85px at 35% 25%, ${ink} 89%, ${clear} 100%)`, cell + 3, cell + 3, offset),
      tile(`radial-gradient(ellipse .85px 3.5px at 23% 38%, ${soft} 89%, ${clear} 100%)`, cell + 3, cell + 3, offset),
    ].join(', '),
  },
  {
    name: 'Split tiles',
    layers: ({ cell, angle, offset }) =>
      tile(`conic-gradient(from ${angle}deg at 35% 55%, ${soft} 0 96deg, ${clear} 96deg 207deg, ${ink} 207deg 232deg, ${clear} 232deg)`,
        cell * 1.7, cell * 1.35, offset),
  },
];

export function phaseBackground(pattern: Pattern, phase: PhaseName): string {
  return `${pattern.layers(geometry[phase])}, color-mix(in srgb, var(--phase-color) 6%, var(--canvas))`;
}
