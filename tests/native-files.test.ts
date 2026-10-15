import { test } from "node:test";
import assert from "node:assert/strict";
import { importFusionCsv, exportFusionCsv } from "../src/native-files";
import { createMacro } from "../src/macros";
test("native Fusion CSV round-trips key/modifier/mouse/wheel/delay events", () => {
  const macro = {
    ...createMacro("native"),
    events: importFusionCsv(
      "ImageIndex,Event,KeyCode\r\n1,LCtrl,162\r\n1,A,65\r\n0,0.3 s\r\n2,A,4\r\n2,LCtrl,1\r\n3,RightButton Down\r\n3,RightButton Up\r\n3,Mouse Point: WheelDown=-1\r\n",
    ).events,
  };
  assert.deepEqual(
    importFusionCsv(exportFusionCsv(macro)).events,
    macro.events,
  );
});
test("CSV import rejects unverified movement and malformed data atomically", () => {
  assert.throws(
    () => importFusionCsv("ImageIndex,Event\n1,A\n3,Mouse Point: X=1, Y=1"),
    /移动/,
  );
  assert.throws(() => importFusionCsv("ImageIndex,Event\n0,no delay"), /延迟/);
  assert.throws(() => importFusionCsv("Other,Event\n1,A"), /不是/);
});
test("native unescaped comma input is recognized, but unreliable native export is refused", () => {
  const macro = importFusionCsv("ImageIndex,Event,KeyCode\n1,,,54\n2,,,54");
  assert.equal(macro.events[0].type, "key");
  assert.throws(() => exportFusionCsv(macro), /逗号/);
});
