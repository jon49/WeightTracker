import { test, suite } from "node:test";
import { strictEqual } from "node:assert";
import { stdev } from "../../js/utils.js";
import { estimateWeeksToGo } from "../../js/charts-shared.js";

suite("Stats", () => {
  suite("stdev", () => {
    test("should be the population standard deviation.", () => {
      strictEqual(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2);
    });

    test("should count values equal to the mean.", () => {
      strictEqual(stdev([5, 5]), 0);
      strictEqual(stdev([4, 5, 6]), Math.sqrt(2 / 3));
    });

    test("should ignore unset values.", () => {
      strictEqual(stdev([4, undefined, 6, null, 0]), 1);
      strictEqual(stdev([]), undefined);
      strictEqual(stdev([undefined]), undefined);
    });
  });

  suite("estimateWeeksToGo", () => {
    test("should range from the average loss to the average change.", () => {
      // Changes: -2, +1, -2 (average -1); losses average -2.
      strictEqual(estimateWeeksToGo([200, 198, 199, 197], 187), "5.0 to 10.0");
    });

    test("should skip weeks without weigh-ins.", () => {
      strictEqual(estimateWeeksToGo([200, null, 198, 197], 187), "10.0 to 10.0");
    });

    test("should not estimate without a current weight or goal.", () => {
      strictEqual(estimateWeeksToGo([200, 198, null], 187), undefined);
      strictEqual(estimateWeeksToGo([200, 198], 0), undefined);
      strictEqual(estimateWeeksToGo([200, 201], 187), undefined);
    });
  });
});
