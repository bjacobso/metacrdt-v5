export type Cell = string;
export type Grid = Cell[][];

export type SceneCtx = {
  cols: number;
  rows: number;
};

export type Scene = {
  id: string;
  cols: number;
  rows: number;
  staticTimeMs: number;
  frame: (tMs: number, ctx: SceneCtx) => Grid;
  scrubbable?: boolean;
};

export function blankGrid(cols: number, rows: number, fill = " "): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function renderGrid(grid: Grid): string {
  return grid.map((row) => row.join("")).join("\n");
}

export function write(grid: Grid, x: number, y: number, text: string): void {
  if (y < 0 || y >= grid.length) {
    return;
  }
  for (let i = 0; i < text.length; i += 1) {
    const col = x + i;
    if (col >= 0 && col < grid[y].length) {
      grid[y][col] = text[i] ?? " ";
    }
  }
}

export function hline(grid: Grid, x: number, y: number, width: number, char = "-"): void {
  write(grid, x, y, char.repeat(Math.max(0, width)));
}

export function vline(grid: Grid, x: number, y: number, height: number, char = "|"): void {
  for (let row = y; row < y + height; row += 1) {
    write(grid, x, row, char);
  }
}

export function box(grid: Grid, x: number, y: number, width: number, height: number): void {
  if (width < 2 || height < 2) {
    return;
  }
  write(grid, x, y, "+");
  hline(grid, x + 1, y, width - 2);
  write(grid, x + width - 1, y, "+");
  vline(grid, x, y + 1, height - 2);
  vline(grid, x + width - 1, y + 1, height - 2);
  write(grid, x, y + height - 1, "+");
  hline(grid, x + 1, y + height - 1, width - 2);
  write(grid, x + width - 1, y + height - 1, "+");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cycleIndex(tMs: number, intervalMs: number, length: number): number {
  return Math.floor(tMs / intervalMs) % length;
}

export function fit(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (text.length <= width) {
    return text.padEnd(width, " ");
  }
  if (width <= 1) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 1)}>`;
}
