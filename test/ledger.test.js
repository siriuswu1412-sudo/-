const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("../vendor/xlsx.full.min.js");
if (XLSX.set_fs) XLSX.set_fs(fs);
global.XLSX = XLSX;
const BJD = require("../js/ledger.js");

const wb = XLSX.readFile(path.join(__dirname, "../samples/ledger.xlsx"), { cellDates: true });
const parsed = BJD.parseWorkbook(wb, { stable: true });
const entries = parsed.entries;
const summary = BJD.summarize(entries);
const fees = BJD.feeParts(entries);

assert.strictEqual(parsed.kind, "original");
assert.strictEqual(parsed.sheetName, "Sheet1");
assert.strictEqual(summary.count, 85);
assert.strictEqual(fees.goods, 7559);
assert.strictEqual(fees.ship, 111);
assert.strictEqual(summary.spent, 7670);
assert.strictEqual(summary.recouped, 3186);
assert.strictEqual(summary.net, -4484);
assert.strictEqual(summary.pending, 0);

const expectCat = {
  素体: { spent: 300, recouped: 0, count: 9 },
  娃衣: { spent: 468, recouped: 120, count: 15 },
  整娃: { spent: 6701, recouped: 3066, count: 52 },
  娃头: { spent: 116, recouped: 0, count: 5 },
  脸片: { spent: 58, recouped: 0, count: 2 },
  假发: { spent: 27, recouped: 0, count: 2 }
};
Object.keys(expectCat).forEach((k) => {
  const got = summary.byCategory[k];
  assert.ok(got, "missing category " + k);
  assert.strictEqual(got.spent, expectCat[k].spent, k + " spent");
  assert.strictEqual(got.recouped, expectCat[k].recouped, k + " sale");
  assert.strictEqual(got.count, expectCat[k].count, k + " count");
});

const expectSize = { 未填尺寸: 300, 十二分: 4031, 特六: 591, 八分: 2748 };
Object.keys(expectSize).forEach((k) => {
  assert.strictEqual(summary.bySize[k].spent, expectSize[k], k);
});

const expectMonth = {
  "2023-10": 228,
  "2025-09": 1496,
  "2025-10": 2553,
  "2025-11": 786,
  "2025-12": 654,
  "2026-10": 50,
  未填日期: 1903
};
Object.keys(expectMonth).forEach((k) => {
  assert.strictEqual(summary.byMonth[k].spent, expectMonth[k], k);
});

assert.strictEqual(summary.byMaker["合玩文化"].spent, 1420);
assert.strictEqual(summary.byMaker["不可食用人偶"].spent, 1302);

const shark = entries.find((e) => e.itemName === "粉心鲨");
assert.strictEqual(shark.project, "海洋宝石");
assert.strictEqual(shark.maker, "c4f");
assert.strictEqual(shark.date, "2025-09-13");
assert.strictEqual(shark.amount, 112);
assert.strictEqual(shark.shipping, 3);
assert.strictEqual(shark.saleAmount, 60);
assert.strictEqual(shark.size, "八分");
assert.deepStrictEqual(shark.gifts, ["空白脸(素头)", "胸配", "头壳"]);
assert.strictEqual(shark.status, "已出");
assert.strictEqual(BJD.net(shark), 60 - 115);

const kingSale = entries.find((e) => e.itemName === "国王" && e.saleAmount === 105);
assert.strictEqual(kingSale.project, "月光童话物语");
assert.strictEqual(kingSale.maker, "不可食用人偶");
assert.strictEqual(kingSale.amount, null);
assert.strictEqual(kingSale.date, "2025-09-21");
assert.strictEqual(kingSale.size, "八分");
assert.strictEqual(kingSale.remainContent, "头");
assert.strictEqual(kingSale.status, "部分出");

const parent = entries.find((e) => e.project === "月光童话物语" && e.amount === 711);
assert.strictEqual(parent.qty, 6);
assert.strictEqual(parent.remainContent, "骑士/圣母");
assert.strictEqual(parent.status, "部分出");
assert.ok(parent.gifts.indexOf("空白脸(素头)") >= 0);

const skirt = entries.find((e) => e.itemName === "紫色系裙子");
assert.strictEqual(skirt.project, "");
assert.strictEqual(skirt.amount, 22);
assert.strictEqual(skirt.category, "娃衣");
assert.strictEqual(BJD.net(skirt), -22);

const kingClothes = entries.find((e) => e.itemName === "国王" && e.tier === "娃衣");
assert.strictEqual(kingClothes.amount, 20);
assert.strictEqual(kingClothes.shipping, 4);
assert.strictEqual(BJD.spent(kingClothes), 24);

const dream = entries.find((e) => e.id === "seed-3");
assert.strictEqual(dream.project, "万梦");
assert.strictEqual(dream.category, "素体");
assert.strictEqual(dream.amount, 30);
assert.strictEqual(dream.date, "2025-10-09");

const longGifts = entries.find((e) => e.project === "献给露娜");
assert.ok(longGifts.gifts.indexOf("白膜头") >= 0);
assert.ok(longGifts.gifts.indexOf("空白脸(素头)") >= 0);
assert.ok(longGifts.gifts.indexOf("植绒手脚") >= 0);
assert.ok(longGifts.gifts.indexOf("带妆脸") >= 0);
assert.ok(longGifts.gifts.indexOf("提灯") >= 0);
assert.strictEqual(longGifts.amount, 860);

const changed = entries.find((e) => e.gifts.indexOf("娃衣换过") >= 0);
assert.ok(changed, "娃衣换过 should stay intact");

const pivot = BJD.pivot(entries, "category", "size", "spent");
let pivotTotal = 0;
pivot.rows.forEach((r) => {
  pivot.cols.forEach((c) => { pivotTotal += BJD.cellAt(pivot, r, c); });
});
assert.strictEqual(pivotTotal, 7670);
assert.strictEqual(BJD.cellAt(pivot, "素体", "未填尺寸"), 300);

const matrix = BJD.entriesToMatrix(entries);
const roundWb = XLSX.utils.book_new();
const roundSheet = XLSX.utils.aoa_to_sheet(matrix);
XLSX.utils.book_append_sheet(roundWb, roundSheet, "匣记");
const round = BJD.parseWorkbook(roundWb);
const roundSum = BJD.summarize(round.entries);
assert.strictEqual(round.kind, "app");
assert.strictEqual(roundSum.count, 85);
assert.strictEqual(roundSum.spent, 7670);
assert.strictEqual(roundSum.recouped, 3186);
assert.strictEqual(roundSum.net, -4484);
const roundShark = round.entries.find((e) => e.itemName === "粉心鲨");
assert.deepStrictEqual(roundShark.gifts, ["空白脸(素头)", "胸配", "头壳"]);

const env = BJD.exportEnvelope(entries, "2026-01-01T00:00:00.000Z");
assert.strictEqual(env.app, "匣记");
assert.ok(!("apiKey" in env));
assert.strictEqual(JSON.stringify(env).indexOf("sk-"), -1);
const back = BJD.importEnvelope(env);
assert.strictEqual(BJD.summarize(back).net, -4484);

const ocr = BJD.parseOcrText([
  "摩点众筹订单",
  "企划：光与影",
  "出品：天系",
  "档位：端盒",
  "尺寸：八分",
  "肤色：普白肌",
  "材质：树脂",
  "具体名字：森之翼",
  "定金：20",
  "尾款：45",
  "尾款截止：2026-05-20",
  "邮费：8",
  "赠品：白膜头、空白脸、水贴",
  "下单时间：2025-10-01"
].join("\n"));
assert.strictEqual(ocr.patch.acquisition, "众筹");
assert.strictEqual(ocr.patch.project, "光与影");
assert.strictEqual(ocr.patch.maker, "天系");
assert.strictEqual(ocr.patch.tier, "端盒");
assert.strictEqual(ocr.patch.size, "八分");
assert.strictEqual(ocr.patch.skin, "普白肌");
assert.strictEqual(ocr.patch.material, "树脂");
assert.strictEqual(ocr.patch.itemName, "森之翼");
assert.strictEqual(ocr.patch.deposit, 20);
assert.strictEqual(ocr.patch.balanceDue, 45);
assert.strictEqual(ocr.patch.amount, 65);
assert.strictEqual(ocr.patch.shipping, 8);
assert.strictEqual(ocr.patch.balanceDueOn, "2026-05-20");
assert.strictEqual(ocr.patch.date, "2025-10-01");
assert.strictEqual(ocr.patch.status, "待尾款");
assert.ok(ocr.patch.gifts.indexOf("白膜头") >= 0);
assert.ok(ocr.patch.gifts.indexOf("空白脸(素头)") >= 0);
assert.ok(ocr.patch.gifts.indexOf("水贴") >= 0);

const spaced = BJD.parseOcrText("众 筹 订 单\n企 划 : 光 与 影\n出 品 : 天 系\n档 位 : 端 盒\n尺 寸 : 十 二 分\n具 体 名 字 : 森 之 翼\n定 金 : 20\n尾 款 : 45\n邮 费 : 8\n赠 品 : 白 膜 头 、 空 白 脸\n下 单 时 间 : 2025-10-01");
assert.strictEqual(spaced.patch.project, "光与影");
assert.strictEqual(spaced.patch.maker, "天系");
assert.strictEqual(spaced.patch.itemName, "森之翼");
assert.strictEqual(spaced.patch.amount, 65);
assert.strictEqual(spaced.patch.size, "十二分");
assert.ok(spaced.patch.gifts.indexOf("白膜头") >= 0);
assert.ok(spaced.patch.gifts.indexOf("空白脸(素头)") >= 0);
assert.strictEqual(spaced.warnings.length, 0);

const sale = BJD.parseOcrText("闲鱼\n出物：十二分 素体 全糖体\n转卖价 ¥40");
assert.strictEqual(sale.patch.acquisition, "闲鱼");
assert.strictEqual(sale.patch.saleAmount, 40);
assert.strictEqual(sale.patch.size, "十二分");
assert.strictEqual(sale.patch.category, "素体");
assert.strictEqual(sale.patch.status, "已出");
assert.ok(sale.patch.amount == null);

const pendingEntry = BJD.normalizeEntry({
  category: "娃衣",
  status: "待尾款",
  amount: 100,
  deposit: 30,
  balanceDue: 70,
  shipping: 8
});
assert.strictEqual(BJD.spent(pendingEntry), 38);
assert.strictEqual(BJD.pending(pendingEntry), 70);
assert.strictEqual(BJD.net(pendingEntry), -38);

assert.strictEqual(entries.length, 85);
assert.strictEqual(summary.net, -4484);

assert.strictEqual(BJD.pivotFileName("category", new Date(2026, 10, 10), false), "匣记-透视-按分类-20261110.xlsx");
assert.strictEqual(BJD.pivotFileName("size", new Date(2026, 0, 2), true), "匣记-透视-全部维度-20260102.xlsx");

function sheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  assert.ok(sheet, "missing sheet " + name);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

const spentBytes = BJD.buildPivotWorkbook(entries, { row: "category", col: "size", metric: "spent" });
const spentWb = XLSX.read(spentBytes, { type: "array" });
assert.deepStrictEqual(spentWb.SheetNames, ["按分类", "明细"]);
const spentRows = sheetRows(spentWb, "按分类");
assert.strictEqual(spentRows[0][0], "分类");
assert.strictEqual(spentRows[0][spentRows[0].length - 1], "合计");
assert.strictEqual(spentRows[spentRows.length - 1][0], "合计");
assert.strictEqual(spentRows[spentRows.length - 1][spentRows[0].length - 1], 7670);
const sizeCol = spentRows[0].indexOf("未填尺寸");
const bodyRow = spentRows.find((row) => row[0] === "素体");
assert.strictEqual(bodyRow[sizeCol], 300);
const spentAddr = XLSX.utils.encode_cell({ r: spentRows.indexOf(bodyRow), c: sizeCol });
assert.strictEqual(spentWb.Sheets["按分类"][spentAddr].t, "n");
assert.strictEqual(typeof spentWb.Sheets["按分类"][spentAddr].v, "number");
let spentColumnTotal = 0;
spentRows.slice(1, -1).forEach((row) => { spentColumnTotal += row[sizeCol]; });
assert.strictEqual(spentColumnTotal, spentRows[spentRows.length - 1][sizeCol]);

const detailBack = BJD.parseWorkbook(spentWb);
assert.strictEqual(detailBack.sheetName, "明细");
const detailSum = BJD.summarize(detailBack.entries);
assert.strictEqual(detailSum.count, 85);
assert.strictEqual(detailSum.spent, 7670);
assert.strictEqual(detailSum.recouped, 3186);
assert.strictEqual(detailSum.net, -4484);

const netWb = XLSX.read(BJD.buildPivotWorkbook(entries, { row: "maker", col: "month", metric: "net" }), { type: "array" });
const netRows = sheetRows(netWb, "按出品");
assert.strictEqual(netRows[0][0], "出品");
assert.strictEqual(netRows[netRows.length - 1][netRows[0].length - 1], -4484);
const netAddr = XLSX.utils.encode_cell({ r: netRows.length - 1, c: netRows[0].length - 1 });
assert.strictEqual(netWb.Sheets["按出品"][netAddr].t, "n");

const recWb = XLSX.read(BJD.buildPivotWorkbook(entries, { row: "month", col: "category", metric: "recouped" }), { type: "array" });
const recRows = sheetRows(recWb, "按月份");
assert.strictEqual(recRows[recRows.length - 1][recRows[0].length - 1], 3186);

const allWb = XLSX.read(BJD.buildPivotWorkbook(entries, { col: "size", metric: "spent", allDims: true }), { type: "array" });
assert.deepStrictEqual(allWb.SheetNames, ["分类", "出品", "月份", "尺寸", "状态", "入手", "企划", "档位"]);
allWb.SheetNames.forEach((name) => {
  const rows = sheetRows(allWb, name);
  assert.strictEqual(rows[rows.length - 1][0], "合计");
  assert.strictEqual(rows[rows.length - 1][rows[0].length - 1], 7670, name);
  const addr = XLSX.utils.encode_cell({ r: rows.length - 1, c: rows[0].length - 1 });
  assert.strictEqual(allWb.Sheets[name][addr].t, "n", name);
});

console.log("ledger tests ok", summary.count, "spent", summary.spent, "net", summary.net);
