import { blankGrid, box, clamp, cycleIndex, fit, hline, type Scene, write } from "./engine";

const events = [
  { id: "#a3f1", hlc: "7.n2", kind: "assert", e: "worker:42", a: "status", v: '"active"' },
  { id: "#91be", hlc: "6.n1", kind: "assert", e: "worker:42", a: "name", v: '"Ada"' },
  { id: "#4c0d", hlc: "5.n2", kind: "retract", e: "worker:7", a: "status", v: "" },
  { id: "#2200", hlc: "4.n1", kind: "assert", e: "worker:7", a: "status", v: '"pending"' },
  { id: "#0f33", hlc: "3.n1", kind: "assert", e: "rule:kyc", a: "emits", v: "requires.kyc" },
];

function eventLine(index: number, highlight: boolean): string {
  const e = events[index % events.length]!;
  const marker = highlight ? ">" : " ";
  return `${marker} ${e.id}  hlc ${e.hlc.padEnd(5)} ${e.kind.padEnd(9)} ${e.e.padEnd(11)} ${e.a.padEnd(8)} ${e.v}`;
}

export const appendOnlyLogScene: Scene = {
  id: "append-only-log",
  cols: 88,
  rows: 18,
  staticTimeMs: 4200,
  frame(tMs, ctx) {
    const cols = clamp(ctx.cols, 48, 92);
    const rows = ctx.rows;
    const grid = blankGrid(cols, rows);
    const width = cols - 4;
    const boxHeight = Math.min(12, rows - 4);
    const active = cycleIndex(tMs, 1500, events.length);
    write(grid, 0, 0, "events -- append-only log");
    box(grid, 1, 2, width, boxHeight);
    const maxRows = boxHeight - 3;
    for (let i = 0; i < maxRows; i += 1) {
      const index = (active + i) % events.length;
      const dim = i > 1 ? " ." : " ";
      write(grid, 3, 3 + i, fit(`${dim}${eventLine(index, i === 0)}`, width - 4));
    }
    const dock = 3 + Math.floor(((tMs % 1500) / 1500) * Math.max(4, width - 28));
    write(grid, dock, boxHeight + 1, fit("new event docks; older rows never rewrite", width - 8));
    write(grid, 3, rows - 2, fit("EventId = content hash | HLC gives deterministic order", width - 4));
    return grid;
  },
};

export const foldScene: Scene = {
  id: "fold-as-state",
  cols: 82,
  rows: 18,
  staticTimeMs: 4800,
  frame(tMs, ctx) {
    const cols = clamp(ctx.cols, 48, 84);
    const rows = ctx.rows;
    const grid = blankGrid(cols, rows);
    const split = Math.floor(cols * 0.48);
    const head = cycleIndex(tMs, 900, 4);
    const log = ['assert name "Ada"', 'assert role "eng"', "retract role", 'assert role "lead"'];
    const states = [
      '{ name: "Ada" }',
      '{ name: "Ada", role: "eng" }',
      '{ name: "Ada", role: empty }',
      '{ name: "Ada", role: "lead" }',
    ];
    write(grid, 0, 0, "LOG (input)");
    write(grid, split, 0, "FOLD -> STATE (output)");
    hline(grid, 0, 1, cols, ".");
    for (let i = 0; i < log.length; i += 1) {
      const marker = i === head ? ">" : " ";
      write(grid, 1, 3 + i * 2, fit(`${marker} ${log[i]}`, split - 3));
      write(grid, split - 4, 3 + i * 2, i === head ? "==>" : "-->");
    }
    box(grid, split, 3, cols - split - 1, 8);
    write(grid, split + 2, 5, fit(states[head]!, cols - split - 5));
    write(grid, split + 2, 8, fit("state is computed, not stored", cols - split - 5));
    write(grid, 1, rows - 3, fit("State = fold(events). Change the events, re-fold, done.", cols - 2));
    return grid;
  },
};

export const bitemporalScene: Scene = {
  id: "bitemporal",
  cols: 74,
  rows: 18,
  staticTimeMs: 5200,
  scrubbable: true,
  frame(tMs, ctx) {
    const cols = clamp(ctx.cols, 48, 78);
    const grid = blankGrid(cols, ctx.rows);
    const phase = (tMs % 6000) / 6000;
    const tx = 2 + Math.floor(phase * 6);
    const valid = 1 + Math.floor(((phase * 1.7) % 1) * 8);
    write(grid, 0, 0, "BITEMPORAL READ");
    write(grid, 2, 2, "txTime");
    write(grid, 11, 2, "validTime ->");
    for (let y = 0; y < 7; y += 1) {
      write(grid, 9, 4 + y, "|");
      for (let x = 0; x < 9; x += 1) {
        const visible = x <= valid && y <= tx && x + y > 3 && x < 8;
        write(grid, 12 + x * 3, 4 + y, visible ? "#" : ".");
      }
    }
    write(grid, 12 + valid * 3, 4 + tx, "O");
    write(grid, 40, 5, fit(`as-of tx=${tx} valid=${valid}`, cols - 42));
    write(grid, 40, 7, fit('{ worker:42 status = "active" }', cols - 42));
    write(grid, 40, 10, fit("retract != tombstone != correction", cols - 42));
    write(grid, 2, 15, fit("Read what we knew then about what was true then.", cols - 4));
    return grid;
  },
};

export const convergenceScene: Scene = {
  id: "set-union-convergence",
  cols: 82,
  rows: 18,
  staticTimeMs: 4500,
  frame(tMs, ctx) {
    const cols = clamp(ctx.cols, 48, 84);
    const grid = blankGrid(cols, ctx.rows);
    const step = cycleIndex(tMs, 1100, 4);
    write(grid, 0, 0, "CONVERGENCE = SET UNION");
    box(grid, 1, 3, Math.floor(cols / 2) - 3, 5);
    box(grid, Math.floor(cols / 2) + 2, 3, Math.floor(cols / 2) - 4, 5);
    write(grid, 3, 5, "Replica A {#a3,#91,#4c}");
    write(grid, Math.floor(cols / 2) + 4, 5, "Replica B {#91,#22,#a3}");
    if (step >= 1) {
      write(grid, Math.floor(cols / 2) - 5, 9, "\\     merge = A union B     /");
      write(grid, Math.floor(cols / 2) - 1, 10, "v                   v");
    }
    if (step >= 2) {
      box(grid, Math.floor(cols / 2) - 15, 12, 31, 4);
      write(grid, Math.floor(cols / 2) - 13, 13, "{#22,#4c,#91,#a3}");
      write(grid, Math.floor(cols / 2) - 13, 14, "both replicas identical");
    }
    if (step >= 3) {
      write(grid, 3, 16, fit("rerun merge: no change | sorted by hlc -> actorId -> eventId", cols - 6));
    }
    return grid;
  },
};

export const derivationScene: Scene = {
  id: "derivation-converges",
  cols: 82,
  rows: 18,
  staticTimeMs: 5000,
  frame(tMs, ctx) {
    const cols = clamp(ctx.cols, 48, 84);
    const grid = blankGrid(cols, ctx.rows);
    const pulse = cycleIndex(tMs, 1000, 4);
    write(grid, 0, 0, 'DERIVATION ALSO CONVERGES ("META")');
    write(grid, 2, 4, "events");
    write(grid, 11, 4, "----+----> derived facts");
    write(grid, 11, 6, "    +----> obligation");
    write(grid, 11, 8, "    +----> workflow run");
    write(grid, 11, 10, "    +----> generated view");
    const labels = [
      "requires.kyc on worker:42",
      '[ ] "KYC form" -> [x]',
      "step 2 unblocks",
      "row updates from same fold",
    ];
    for (let i = 0; i < labels.length; i += 1) {
      const y = 4 + i * 2;
      write(grid, 39, y, fit(`${i === pulse ? ">" : " "} ${labels[i]}`, cols - 41));
    }
    write(grid, 2, 14, fit("one fold per layer | no layer is separately synchronized", cols - 4));
    write(grid, 2, 16, fit("Truth has a tense, and derivation inherits it.", cols - 4));
    return grid;
  },
};

export const scenes = {
  appendOnlyLogScene,
  foldScene,
  bitemporalScene,
  convergenceScene,
  derivationScene,
};
