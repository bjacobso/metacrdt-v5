import { VIEWSPEC_IR_SNAPSHOT_TARGETS, writeViewSpecIrSnapshot } from "./viewspec-ir-snapshots.js";

for (const target of VIEWSPEC_IR_SNAPSHOT_TARGETS) {
  writeViewSpecIrSnapshot(target);
}
