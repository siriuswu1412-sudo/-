const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("../vendor/xlsx.full.min.js");
if (XLSX.set_fs) XLSX.set_fs(fs);
global.XLSX = XLSX;
const Rules = require("../js/rules.js");
const BJD = require("../js/ledger.js");

const wb = XLSX.readFile(path.join(__dirname, "../samples/ledger.xlsx"), { cellDates: true });
const entries = BJD.parseWorkbook(wb, { stable: true }).entries;
const report = Rules.evaluate(entries);

assert.strictEqual(report.totals.count, 85);
assert.strictEqual(report.totals.spent, 7670);
assert.strictEqual(report.totals.recouped, 3186);
assert.strictEqual(report.totals.net, -4484);
assert.strictEqual(report.totals.pending, 0);
assert.strictEqual(report.totals.goodsPaid, 7559);
assert.strictEqual(report.totals.shipping, 111);
assert.strictEqual(report.groups.category["整娃"].spent, 6701);
assert.strictEqual(report.groups.category["娃衣"].spent, 468);
assert.strictEqual(report.groups.size["十二分"].spent, 4031);
assert.strictEqual(report.groups.month["2025-10"].spent, 2553);
assert.strictEqual(report.groups.maker["合玩文化"].spent, 1420);
assert.ok(report.groups.gifts["白膜头"].count >= 1);
assert.ok(report.trace.spent.rules.some((rule) => rule.id === "spent"));
assert.ok(report.trace.spent.rules.some((rule) => rule.id === "goods-paid-amount"));
assert.strictEqual(report.trace.spent.entries.reduce((sum, row) => sum + row.value, 0), 7670);

const pending = Rules.evaluate([{
  id: "tail",
  status: "待尾款",
  amount: 100,
  deposit: 30,
  balanceDue: 70,
  shipping: 8,
  proxyFee: null,
  saleAmount: null,
  saleContent: "",
  category: "娃衣",
  gifts: ["白膜头", "水贴"],
  date: "2026-01-02",
  maker: "测试",
  itemName: "尾款样例",
  project: "样例",
  qty: 1,
  size: "十二分"
}]);
assert.strictEqual(pending.totals.spent, 38);
assert.strictEqual(pending.totals.pending, 70);
assert.strictEqual(pending.totals.net, -38);
assert.strictEqual(pending.groups.gifts["白膜头"].count, 1);
assert.strictEqual(pending.groups.gifts["水贴"].count, 1);

const noShip = Rules.defaultRules().map((rule) => rule.id === "shipping" ? Object.assign({}, rule, { enabled: false }) : rule);
const withoutShip = Rules.evaluate(entries, noShip);
assert.strictEqual(withoutShip.totals.spent, 7559);
assert.strictEqual(withoutShip.totals.net, 3186 - 7559);

assert.throws(() => Rules.normalizeRule({ id: "x", description: "坏公式", target: "spent", formula: { op: "eval", code: "1" } }));

const doc = Rules.exportDoc(Rules.defaultRules());
assert.strictEqual(doc.kind, "rules");
assert.ok(!("apiKey" in doc));
const back = Rules.importDoc(doc);
assert.strictEqual(back.length, Rules.defaultRules().length);
assert.strictEqual(Rules.evaluate(entries, back).totals.net, -4484);

const custom = Rules.importDoc({
  rules: [{
    id: "bonus",
    description: "每笔再记 1 元支出",
    enabled: true,
    target: "spent",
    condition: { op: "always" },
    formula: { op: "add", args: [{ op: "ref", name: "spent" }, { op: "lit", value: 1 }] }
  }]
});
assert.strictEqual(Rules.evaluate(entries, custom).totals.spent, 7670 + 85);

console.log("rules tests ok", report.totals.count, report.totals.spent, report.totals.recouped, report.totals.net);
