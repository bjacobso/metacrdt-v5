import { PROTOCOL_IR_SNAPSHOT_TARGETS, writeProtocolIrSnapshot } from "./protocol-ir-snapshots.js";

for (const target of PROTOCOL_IR_SNAPSHOT_TARGETS) {
  writeProtocolIrSnapshot(target);
}
