/* 匣记 · 账本计算、导入与截图字段解析。浏览器与 Node 共用。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BJD = api;
})(typeof self !== "undefined" ? self : this, function () {
  var CATEGORIES = ["整娃", "娃头", "素体", "娃衣", "假发", "眼珠", "鞋子", "配饰/小物", "妆面", "手组/改造", "道具", "脸片", "其他"];
  var ACQUISITIONS = ["现货", "预定", "众筹", "闲鱼", "代购", "赠送"];
  var STATUSES = ["已付定", "待尾款", "待发货", "已到", "部分出", "已出"];
  var SIZES = ["三分", "大三", "四分", "大四", "六分", "小六分", "小六", "特六", "八分", "小八分", "小八", "十二分", "小十二分", "OB11", "OB22", "OB24", "叔体", "小叔"];
  var SKINS = ["普肌", "白肌", "普白肌", "半白", "超白", "OB白", "烧肌", "浅烧", "粉肌", "黄肌"];
  var MATERIALS = ["树脂", "搪胶", "PVC", "软胶", "布"];
  var TIERS = ["单盒", "三连", "端盒", "ALL IN", "明盒", "盲盒", "吊卡", "加购", "裸娃", "散件"];
  var GIFT_PRESETS = [
    "手组支架", "白膜头", "空白脸(素头)", "后脑勺", "植发头", "替换手", "眼珠",
    "磁吸配件", "收纳袋", "合格证/卡片", "水贴", "脖卡", "防染色服", "白膜鞋",
    "开眼脸", "印妆脸", "带妆脸", "眼片", "支架", "胸配", "头壳", "爪套", "提灯",
    "南瓜裤", "打底裤", "植绒手脚", "蜡笔脸"
  ];

  var GIFT_ALIASES = [
    ["手组支架", "手组支架"],
    ["空白脸(素头)", "空白脸(素头)"],
    ["合格证/卡片", "合格证/卡片"],
    ["植绒手脚", "植绒手脚"],
    ["防染色服", "防染色服"],
    ["磁吸配件", "磁吸配件"],
    ["收纳袋", "收纳袋"],
    ["替换手", "替换手"],
    ["植发头", "植发头"],
    ["后脑勺", "后脑勺"],
    ["白膜头", "白膜头"],
    ["白模头", "白膜头"],
    ["白膜鞋", "白膜鞋"],
    ["白模鞋", "白膜鞋"],
    ["空白脸", "空白脸(素头)"],
    ["素头", "空白脸(素头)"],
    ["开眼脸", "开眼脸"],
    ["印妆脸", "印妆脸"],
    ["带妆脸", "带妆脸"],
    ["蜡笔脸", "蜡笔脸"],
    ["南瓜裤", "南瓜裤"],
    ["打底裤", "打底裤"],
    ["合格证", "合格证/卡片"],
    ["卡片", "合格证/卡片"],
    ["眼片", "眼片"],
    ["眼珠", "眼珠"],
    ["水贴", "水贴"],
    ["脖卡", "脖卡"],
    ["胸配", "胸配"],
    ["头壳", "头壳"],
    ["爪套", "爪套"],
    ["提灯", "提灯"],
    ["手组", "手组支架"],
    ["支架", "支架"],
    ["鞋子", "鞋子"],
    ["娃衣", "娃衣"],
    ["素体", "素体"],
    ["鞋", "鞋子"]
  ].sort(function (a, b) { return b[0].length - a[0].length; });

  var TIER_CAT = {
    "素体": "素体",
    "娃衣": "娃衣",
    "娃头": "娃头",
    "脸片": "脸片",
    "发片": "假发",
    "假发": "假发",
    "眼珠": "眼珠",
    "鞋子": "鞋子",
    "妆面": "妆面",
    "约妆": "妆面",
    "整娃": "整娃",
    "裸娃": "整娃",
    "allin": "整娃",
    "all in": "整娃",
    "端盒": "整娃",
    "吊卡": "整娃"
  };

  var CAT_ALIAS = {
    "发片": "假发",
    "约妆": "妆面",
    "娃": "整娃",
    "衣服": "娃衣",
    "头": "娃头",
    "鞋": "鞋子"
  };

  var EXPORT_HEADERS = [
    "分类", "入手方式", "时间", "企划名字", "出品", "具体名字", "购买数量", "金额", "档位",
    "尺寸", "肤色", "材质", "邮费", "代购费", "定金", "定金日期", "尾款", "尾款日期", "状态",
    "赠品小物", "出物内容", "卖出数量", "卖出金额", "剩余内容", "备注"
  ];

  function blankEntry() {
    return {
      id: "",
      category: "整娃",
      acquisition: "",
      date: "",
      project: "",
      maker: "",
      itemName: "",
      qty: null,
      amount: null,
      tier: "",
      size: "",
      skin: "",
      material: "",
      shipping: null,
      proxyFee: null,
      deposit: null,
      depositPaidOn: "",
      balanceDue: null,
      balanceDueOn: "",
      status: "已到",
      gifts: [],
      saleContent: "",
      saleQty: null,
      saleAmount: null,
      remainContent: "",
      note: "",
      createdAt: "",
      updatedAt: ""
    };
  }

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = typeof v === "number" ? v : Number(String(v).replace(/[,，¥￥\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    var t = String(v).replace(/[,，¥￥\s]/g, "");
    if (!t) return null;
    var n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function isBlankNum(v) {
    return v === null || v === undefined || v === "";
  }

  function text(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function iso(y, m, d) {
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function formatDate(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v.getTime())) {
      if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0) {
        return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
      }
      return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if (typeof v === "string") {
      var m = v.trim().match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
      if (m) return iso(+m[1], +m[2], +m[3]);
    }
    return "";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function rulesApi() {
    var g = typeof globalThis !== "undefined" ? globalThis : this;
    if (g.BJDRules && g.BJDRules.evaluate) return g.BJDRules;
    if (typeof require === "function") return require("./rules.js");
    throw new Error("规则引擎未加载");
  }

  function measured(e) {
    return rulesApi().measure(e);
  }

  function goodsPaid(e) { return measured(e).goodsPaid; }
  function spent(e) { return measured(e).spent; }
  function pending(e) { return measured(e).pending; }
  function recouped(e) { return measured(e).recouped; }
  function net(e) { return measured(e).net; }

  function feeParts(entries) {
    var report = rulesApi().evaluate(entries);
    return { goods: report.totals.goodsPaid, ship: report.totals.shipping, proxy: report.totals.proxyFee };
  }

  function splitGifts(value) {
    if (Array.isArray(value)) {
      var out = [];
      value.forEach(function (item) {
        splitGifts(item).forEach(function (g) {
          if (out.indexOf(g) < 0) out.push(g);
        });
      });
      return out;
    }
    var raw = text(value);
    if (!raw) return [];
    if (raw === "增全" || raw === "娃衣换过" || (/换过|改过/.test(raw) && raw.length <= 10 && raw.indexOf("、") < 0 && raw.indexOf("/") < 0)) {
      return [raw];
    }
    var found = [];
    var i = 0;
    while (i < raw.length) {
      var ch = raw.charAt(i);
      if (/[\s\d,，、/／+＋×xX个套只:：;；|｜()（）\[\]【】]/.test(ch)) {
        i += 1;
        continue;
      }
      var matched = null;
      for (var a = 0; a < GIFT_ALIASES.length; a++) {
        if (raw.indexOf(GIFT_ALIASES[a][0], i) === i) {
          matched = GIFT_ALIASES[a];
          break;
        }
      }
      if (matched) {
        if (found.indexOf(matched[1]) < 0) found.push(matched[1]);
        i += matched[0].length;
        continue;
      }
      var j = i;
      while (j < raw.length && !/[\s\d,，、/／+＋×xX个套只:：;；|｜()（）]/.test(raw.charAt(j))) j += 1;
      var frag = raw.slice(i, j).trim();
      if (frag && found.indexOf(frag) < 0) found.push(frag);
      i = Math.max(j, i + 1);
    }
    return found;
  }

  function categoryFrom(section, tier) {
    var sec = text(section);
    if (sec === "素体" || sec === "娃衣") return sec;
    if (CATEGORIES.indexOf(sec) >= 0 && sec !== "娃") return sec;
    var t = text(tier);
    if (TIER_CAT[t]) return TIER_CAT[t];
    var lower = t.toLowerCase();
    if (TIER_CAT[lower]) return TIER_CAT[lower];
    if (CAT_ALIAS[t]) return CAT_ALIAS[t];
    if (sec === "娃" || sec === "" || sec === "整娃") return "整娃";
    return "其他";
  }

  function inferStatus(e) {
    var sale = num(e.saleAmount);
    var hasSaleText = text(e.saleContent).length > 0;
    var hasRemain = text(e.remainContent).length > 0;
    var cost = num(e.amount) + num(e.shipping) + num(e.proxyFee);
    if (hasRemain) return "部分出";
    if (sale > 0) return "已出";
    if (hasSaleText && cost > 0 && sale === 0) return "部分出";
    if (hasSaleText) return "已出";
    return "已到";
  }

  function normalizeEntry(input) {
    var e = blankEntry();
    var src = input || {};
    Object.keys(e).forEach(function (k) {
      if (src[k] !== undefined && src[k] !== null) e[k] = src[k];
    });
    e.id = text(src.id);
    e.category = text(src.category);
    if (CAT_ALIAS[e.category]) e.category = CAT_ALIAS[e.category];
    if (!e.category) e.category = "其他";
    e.acquisition = text(src.acquisition);
    e.date = formatDate(src.date) || text(src.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) e.date = "";
    e.project = text(src.project);
    e.maker = text(src.maker);
    e.itemName = text(src.itemName);
    e.qty = numOrNull(src.qty);
    e.amount = numOrNull(src.amount);
    e.tier = text(src.tier);
    e.size = text(src.size);
    e.skin = text(src.skin);
    e.material = text(src.material);
    e.shipping = numOrNull(src.shipping);
    e.proxyFee = numOrNull(src.proxyFee);
    e.deposit = numOrNull(src.deposit);
    e.depositPaidOn = formatDate(src.depositPaidOn) || "";
    e.balanceDue = numOrNull(src.balanceDue);
    e.balanceDueOn = formatDate(src.balanceDueOn) || "";
    e.status = text(src.status);
    if (STATUSES.indexOf(e.status) < 0) e.status = inferStatus(e);
    e.gifts = splitGifts(src.gifts);
    e.saleContent = text(src.saleContent);
    e.saleQty = numOrNull(src.saleQty);
    e.saleAmount = numOrNull(src.saleAmount);
    e.remainContent = text(src.remainContent);
    e.note = text(src.note);
    e.createdAt = text(src.createdAt);
    e.updatedAt = text(src.updatedAt);
    return e;
  }

  function stamp(e, now) {
    var t = now || new Date().toISOString();
    if (!e.createdAt) e.createdAt = t;
    e.updatedAt = t;
    return e;
  }

  function summarize(entries) {
    return rulesApi().summarize(entries);
  }

  function dimValue(e, dim) {
    switch (dim) {
      case "category": return e.category || "其他";
      case "maker": return e.maker || "未填出品";
      case "month": return e.date ? e.date.slice(0, 7) : "未填日期";
      case "size": return e.size || "未填尺寸";
      case "status": return e.status || "未填";
      case "acquisition": return e.acquisition || "未注明";
      case "project": return e.project || "未填企划";
      case "tier": return e.tier || "未填档位";
      default: return "其他";
    }
  }

  function metricValue(e, metric) {
    if (metric === "count") return 1;
    if (metric === "qty") return num(e.qty);
    if (metric === "spent") return spent(e);
    if (metric === "recouped") return recouped(e);
    if (metric === "net") return recouped(e) - spent(e);
    return 0;
  }

  function sortDimKeys(keys, dim) {
    var natural = {
      category: CATEGORIES.concat(["其他"]),
      size: SIZES.concat(["未填尺寸"]),
      status: STATUSES.concat(["未填"]),
      acquisition: ACQUISITIONS.concat(["未注明"])
    };
    if (dim === "month") {
      return keys.slice().sort(function (a, b) {
        if (a === "未填日期") return 1;
        if (b === "未填日期") return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
    if (natural[dim]) {
      var order = natural[dim];
      return keys.slice().sort(function (a, b) {
        var ia = order.indexOf(a);
        var ib = order.indexOf(b);
        if (ia < 0) ia = 1000;
        if (ib < 0) ib = 1000;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b, "zh");
      });
    }
    return keys.slice().sort(function (a, b) { return a.localeCompare(b, "zh"); });
  }

  function pivot(entries, rowDim, colDim, metric) {
    var cell = {};
    var rowSet = {};
    var colSet = {};
    entries.forEach(function (e) {
      var r = dimValue(e, rowDim);
      var c = dimValue(e, colDim);
      rowSet[r] = true;
      colSet[c] = true;
      var k = r + "\0" + c;
      cell[k] = (cell[k] || 0) + metricValue(e, metric);
    });
    var rows = sortDimKeys(Object.keys(rowSet), rowDim);
    var cols = sortDimKeys(Object.keys(colSet), colDim);
    if (rowDim !== "month" && rowDim !== "category" && rowDim !== "size" && rowDim !== "status" && rowDim !== "acquisition") {
      rows.sort(function (a, b) {
        var ta = 0, tb = 0;
        cols.forEach(function (c) {
          ta += cell[a + "\0" + c] || 0;
          tb += cell[b + "\0" + c] || 0;
        });
        return tb - ta || a.localeCompare(b, "zh");
      });
    }
    if (colDim !== "month" && colDim !== "category" && colDim !== "size" && colDim !== "status" && colDim !== "acquisition") {
      cols.sort(function (a, b) {
        var ta = 0, tb = 0;
        rows.forEach(function (r) {
          ta += cell[r + "\0" + a] || 0;
          tb += cell[r + "\0" + b] || 0;
        });
        return tb - ta || a.localeCompare(b, "zh");
      });
    }
    return { rows: rows, cols: cols, cell: cell, metric: metric };
  }

  function cellAt(p, r, c) {
    return p.cell[r + "\0" + c] || 0;
  }

  function getXLSX() {
    if (typeof XLSX !== "undefined") return XLSX;
    throw new Error("缺少表格库");
  }

  function sheetRows(sheet) {
    return getXLSX().utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  }

  function detectKind(rows) {
    var head = (rows || []).slice(0, 4).map(function (r) {
      return (r || []).map(function (c) { return text(c); }).join("|");
    }).join("\n");
    if (head.indexOf("入手方式") >= 0 && head.indexOf("企划名字") >= 0) return "app";
    if (head.indexOf("企划名字") >= 0 && (head.indexOf("赠品") >= 0 || head.indexOf("购入") >= 0 || head.indexOf("出品") >= 0)) {
      return "original";
    }
    return "";
  }

  function applyShareMerges(rows, merges, shareCols) {
    var copy = rows.map(function (r) { return (r || []).slice(); });
    (merges || []).forEach(function (m) {
      var sr = m.s.r, sc = m.s.c, er = m.e.r, ec = m.e.c;
      var top = copy[sr] || [];
      for (var r = sr; r <= er; r++) {
        if (!copy[r]) copy[r] = [];
        for (var c = sc; c <= ec; c++) {
          if (!shareCols[c]) continue;
          if (r === sr && c === sc) continue;
          if (copy[r][c] == null || copy[r][c] === "") copy[r][c] = top[c];
        }
      }
    });
    return copy;
  }

  function indexesOf(header, name) {
    var out = [];
    header.forEach(function (c, i) {
      if (text(c) === name) out.push(i);
    });
    return out;
  }

  function resolveOriginalColumns(header) {
    var amounts = indexesOf(header, "金额");
    var qtys = indexesOf(header, "数量");
    var time = header.findIndex(function (c) { return text(c) === "时间"; });
    return {
      section: time > 0 ? time - 1 : 0,
      date: time,
      project: header.findIndex(function (c) { return text(c) === "企划名字"; }),
      maker: header.findIndex(function (c) { return text(c) === "出品"; }),
      qty: header.findIndex(function (c) { return text(c) === "购买数量"; }) >= 0
        ? header.findIndex(function (c) { return text(c) === "购买数量"; })
        : (qtys[0] != null ? qtys[0] : 4),
      amount: amounts[0] != null ? amounts[0] : 5,
      tier: header.findIndex(function (c) { return text(c) === "档位"; }),
      itemName: header.findIndex(function (c) { return text(c) === "具体名字"; }),
      gifts: header.findIndex(function (c) { return text(c) === "赠品小物"; }),
      size: header.findIndex(function (c) { return text(c) === "尺寸"; }),
      shipping: header.findIndex(function (c) { return text(c) === "邮费"; }),
      saleContent: header.findIndex(function (c) { return text(c) === "出物内容"; }),
      saleQty: qtys.length > 1 ? qtys[qtys.length - 1] : 12,
      saleAmount: amounts.length > 1 ? amounts[1] : 13,
      remain: header.findIndex(function (c) { return text(c) === "剩余内容"; })
    };
  }

  function at(row, i) {
    if (i == null || i < 0) return null;
    return row[i];
  }

  function makeId(excelRow, options) {
    if (options && options.stable) return "seed-" + excelRow;
    return "imp-" + excelRow + "-" + Math.random().toString(36).slice(2, 8);
  }

  function parseOriginal(rows, merges, options) {
    var headerIdx = -1;
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      if ((rows[i] || []).some(function (c) { return text(c) === "企划名字"; })) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) throw new Error("找不到表头");
    var cols = resolveOriginalColumns(rows[headerIdx] || []);
    var share = {};
    [cols.date, cols.project, cols.maker, cols.tier, cols.size].forEach(function (c) {
      if (c >= 0) share[c] = true;
    });
    var filled = applyShareMerges(rows, merges, share);
    var section = "";
    var entries = [];
    var now = (options && options.now) || "2026-01-01T00:00:00.000Z";
    for (var r = headerIdx + 1; r < filled.length; r++) {
      var row = filled[r] || [];
      var sec = text(at(row, cols.section));
      if (sec) section = sec;
      var meaningful = [cols.date, cols.project, cols.maker, cols.qty, cols.amount, cols.tier, cols.itemName, cols.gifts, cols.size, cols.shipping, cols.saleContent, cols.saleQty, cols.saleAmount, cols.remain]
        .some(function (idx) {
          var v = at(row, idx);
          return v != null && text(v) !== "";
        });
      if (!meaningful) continue;
      var tier = text(at(row, cols.tier));
      var entry = blankEntry();
      entry.id = makeId(r + 1, options);
      entry.category = categoryFrom(section, tier);
      entry.date = formatDate(at(row, cols.date));
      entry.project = text(at(row, cols.project));
      entry.maker = text(at(row, cols.maker));
      entry.qty = numOrNull(at(row, cols.qty));
      entry.amount = numOrNull(at(row, cols.amount));
      entry.tier = tier;
      entry.itemName = text(at(row, cols.itemName));
      entry.gifts = splitGifts(at(row, cols.gifts));
      entry.size = text(at(row, cols.size));
      entry.shipping = numOrNull(at(row, cols.shipping));
      entry.saleContent = text(at(row, cols.saleContent));
      entry.saleQty = numOrNull(at(row, cols.saleQty));
      entry.saleAmount = numOrNull(at(row, cols.saleAmount));
      entry.remainContent = text(at(row, cols.remain));
      entry.status = inferStatus(entry);
      entry.createdAt = entry.date ? entry.date + "T00:00:00.000Z" : now;
      entry.updatedAt = entry.createdAt;
      entries.push(entry);
    }
    return entries;
  }

  function headerMap(header) {
    var map = {};
    header.forEach(function (c, i) {
      var name = text(c);
      if (name && map[name] == null) map[name] = i;
    });
    return map;
  }

  function parseApp(rows, options) {
    var headerIdx = -1;
    for (var i = 0; i < Math.min(rows.length, 5); i++) {
      var names = (rows[i] || []).map(text);
      if (names.indexOf("分类") >= 0 && names.indexOf("企划名字") >= 0) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) throw new Error("找不到表头");
    var map = headerMap(rows[headerIdx]);
    function pick(row, name) {
      var idx = map[name];
      if (idx == null) return null;
      return row[idx];
    }
    var entries = [];
    var now = new Date().toISOString();
    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (!row.some(function (c) { return c != null && text(c) !== ""; })) continue;
      var entry = normalizeEntry({
        id: makeId(r + 1, options),
        category: pick(row, "分类"),
        acquisition: pick(row, "入手方式"),
        date: pick(row, "时间"),
        project: pick(row, "企划名字"),
        maker: pick(row, "出品"),
        itemName: pick(row, "具体名字"),
        qty: pick(row, "购买数量"),
        amount: pick(row, "金额"),
        tier: pick(row, "档位"),
        size: pick(row, "尺寸"),
        skin: pick(row, "肤色"),
        material: pick(row, "材质"),
        shipping: pick(row, "邮费"),
        proxyFee: pick(row, "代购费"),
        deposit: pick(row, "定金"),
        depositPaidOn: pick(row, "定金日期"),
        balanceDue: pick(row, "尾款"),
        balanceDueOn: pick(row, "尾款日期"),
        status: pick(row, "状态"),
        gifts: pick(row, "赠品小物"),
        saleContent: pick(row, "出物内容"),
        saleQty: pick(row, "卖出数量"),
        saleAmount: pick(row, "卖出金额"),
        remainContent: pick(row, "剩余内容"),
        note: pick(row, "备注"),
        createdAt: now,
        updatedAt: now
      });
      var hasContent = entry.project || entry.itemName || entry.maker || entry.amount != null || entry.saleAmount != null || entry.saleContent || entry.shipping != null;
      if (!hasContent) continue;
      entries.push(entry);
    }
    return entries;
  }

  function parseSheet(sheet, merges, options) {
    var rows = sheetRows(sheet);
    var kind = detectKind(rows);
    if (kind === "original") return { kind: kind, entries: parseOriginal(rows, merges || sheet["!merges"] || [], options) };
    if (kind === "app") return { kind: kind, entries: parseApp(rows, options) };
    return { kind: "", entries: [] };
  }

  function parseWorkbook(workbook, options) {
    var names = workbook.SheetNames || [];
    var chosen = null;
    var chosenName = names[0];
    for (var i = 0; i < names.length; i++) {
      var sheet = workbook.Sheets[names[i]];
      var rows = sheetRows(sheet);
      var kind = detectKind(rows);
      if (kind) {
        chosen = sheet;
        chosenName = names[i];
        break;
      }
    }
    if (!chosen) chosen = workbook.Sheets[chosenName];
    var parsed = parseSheet(chosen, chosen["!merges"] || [], options);
    if (!parsed.kind) {
      throw new Error("没有认出账本格式");
    }
    parsed.sheetName = chosenName;
    return parsed;
  }

  function parseArrayBuffer(buf, options) {
    var wb = getXLSX().read(buf, { type: "array", cellDates: true });
    return parseWorkbook(wb, options);
  }

  function entriesToMatrix(entries) {
    var rows = [EXPORT_HEADERS.slice()];
    entries.forEach(function (raw) {
      var e = normalizeEntry(raw);
      rows.push([
        e.category, e.acquisition, e.date, e.project, e.maker, e.itemName,
        e.qty, e.amount, e.tier, e.size, e.skin, e.material,
        e.shipping, e.proxyFee, e.deposit, e.depositPaidOn, e.balanceDue, e.balanceDueOn,
        e.status, e.gifts.join("、"), e.saleContent, e.saleQty, e.saleAmount, e.remainContent, e.note
      ]);
    });
    return rows;
  }

  function publicEntry(raw) {
    var e = normalizeEntry(raw);
    return {
      id: e.id,
      category: e.category,
      acquisition: e.acquisition,
      date: e.date,
      project: e.project,
      maker: e.maker,
      itemName: e.itemName,
      qty: e.qty,
      amount: e.amount,
      tier: e.tier,
      size: e.size,
      skin: e.skin,
      material: e.material,
      shipping: e.shipping,
      proxyFee: e.proxyFee,
      deposit: e.deposit,
      depositPaidOn: e.depositPaidOn,
      balanceDue: e.balanceDue,
      balanceDueOn: e.balanceDueOn,
      status: e.status,
      gifts: e.gifts,
      saleContent: e.saleContent,
      saleQty: e.saleQty,
      saleAmount: e.saleAmount,
      remainContent: e.remainContent,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    };
  }

  function exportEnvelope(entries, now) {
    return {
      app: "匣记",
      version: 1,
      exportedAt: now || new Date().toISOString(),
      entries: entries.map(publicEntry)
    };
  }

  function importEnvelope(obj) {
    var list = obj;
    if (obj && !Array.isArray(obj) && Array.isArray(obj.entries)) list = obj.entries;
    if (!Array.isArray(list)) throw new Error("JSON 里没有账目");
    return list.map(function (item, i) {
      var e = normalizeEntry(item);
      if (!e.id) e.id = "json-" + (i + 1) + "-" + Math.random().toString(36).slice(2, 7);
      return e;
    });
  }

  function firstMatch(src, re) {
    var m = src.match(re);
    return m ? m[1].trim() : "";
  }

  function moneyAfter(src, labelRe) {
    var re = new RegExp("(?:" + labelRe + ")\\s*[:：]?\\s*[¥￥]?\\s*(\\d+(?:\\.\\d{1,2})?)");
    var m = src.match(re);
    return m ? Number(m[1]) : null;
  }

  function tightenOcr(s) {
    return String(s || "").split("\n").map(function (line) {
      var out = "";
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        if (ch === " " || ch === "\t") {
          var prev = out.slice(-1);
          var j = i + 1;
          while (j < line.length && (line.charAt(j) === " " || line.charAt(j) === "\t")) j++;
          var next = line.charAt(j) || "";
          var glue = /[\u3400-\u9fff：:、，,。./／¥￥\d]/;
          if (!prev || !next || (glue.test(prev) && glue.test(next))) {
            i = j - 1;
            continue;
          }
          if (out.slice(-1) !== " ") out += " ";
          i = j - 1;
          continue;
        }
        out += ch;
      }
      return out;
    }).join("\n");
  }

  function parseOcrText(input) {
    var src = tightenOcr(String(input || "").replace(/\r/g, ""));
    var flat = src.replace(/[ \t]+/g, "");
    var patch = {};
    var warnings = [];

    if (/闲鱼|转卖|出娃|出物/.test(flat)) patch.acquisition = "闲鱼";
    else if (/众筹|摩点|modian/i.test(flat)) patch.acquisition = "众筹";
    else if (/代购/.test(flat)) patch.acquisition = "代购";
    else if (/预定|預售|预售|定金|补款/.test(flat)) patch.acquisition = "预定";
    else if (/现货/.test(flat)) patch.acquisition = "现货";

    var sizes = SIZES.slice().sort(function (a, b) { return b.length - a.length; });
    for (var s = 0; s < sizes.length; s++) {
      if (flat.indexOf(sizes[s]) >= 0) {
        patch.size = sizes[s];
        break;
      }
    }

    var skins = SKINS.slice().sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < skins.length; k++) {
      if (flat.indexOf(skins[k]) >= 0) {
        patch.skin = skins[k];
        break;
      }
    }
    for (var m = 0; m < MATERIALS.length; m++) {
      if (flat.indexOf(MATERIALS[m]) >= 0) {
        patch.material = MATERIALS[m];
        break;
      }
    }

    var project = firstMatch(src, /(?:企划(?:名字)?|项目)\s*[:：]\s*([^\n]{1,40})/);
    var maker = firstMatch(src, /(?:出品|娃厂|工作室|品牌)\s*[:：]\s*([^\n]{1,40})/);
    var itemName = firstMatch(src, /(?:具体名字|名字|角色|款式)\s*[:：]\s*([^\n]{1,40})/);
    var tier = firstMatch(src, /(?:档位)\s*[:：]\s*([^\n]{1,20})/);
    if (project) patch.project = project.replace(/[¥￥].*$/, "").trim();
    if (maker) patch.maker = maker.replace(/[¥￥].*$/, "").trim();
    if (itemName) patch.itemName = itemName.replace(/[¥￥].*$/, "").trim();
    if (tier) patch.tier = tier.trim();
    else if (/ALL\s*IN/i.test(flat)) patch.tier = "ALL IN";
    else if (flat.indexOf("端盒") >= 0) patch.tier = "端盒";
    else if (flat.indexOf("三连") >= 0) patch.tier = "三连";
    else if (flat.indexOf("单盒") >= 0) patch.tier = "单盒";
    else if (flat.indexOf("吊卡") >= 0) patch.tier = "吊卡";

    var qty = firstMatch(flat, /(?:数量|件数)\s*[:：]?\s*(\d+)/);
    if (!qty) {
      var qx = flat.match(/[xX×]\s*(\d+)/);
      if (qx) qty = qx[1];
    }
    if (qty) patch.qty = Number(qty);

    var deposit = moneyAfter(flat, "定金|首款");
    var balanceDue = moneyAfter(flat, "尾款|补款");
    var shipping = moneyAfter(flat, "邮费|运费");
    var proxyFee = moneyAfter(flat, "代购费|代购");
    var paid = moneyAfter(flat, "实付|实付款|合计|支付金额|付款金额");
    var labeledAmount = moneyAfter(flat, "金额|价格|售价");
    var yen = flat.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/);
    var saleLabeled = moneyAfter(flat, "转卖价|出物价|卖出价|成交价");

    if (deposit != null) patch.deposit = deposit;
    if (balanceDue != null) patch.balanceDue = balanceDue;
    if (shipping != null) patch.shipping = shipping;
    if (proxyFee != null) patch.proxyFee = proxyFee;

    var saleContext = patch.acquisition === "闲鱼" || /转卖|出物|出娃/.test(flat);
    if (saleContext) {
      patch.saleAmount = saleLabeled != null ? saleLabeled : (paid != null ? paid : (yen ? Number(yen[1]) : null));
      if (patch.saleAmount == null) delete patch.saleAmount;
      var saleLine = firstMatch(src, /(?:出物|出娃|转卖)\s*[:：]\s*([^\n]{1,60})/);
      if (saleLine) patch.saleContent = saleLine.replace(/[¥￥]\s*\d+(?:\.\d{1,2})?/, "").trim();
    } else if (deposit != null && balanceDue != null) {
      patch.amount = Math.round((deposit + balanceDue) * 100) / 100;
    } else if (paid != null) {
      patch.amount = paid;
    } else if (labeledAmount != null) {
      patch.amount = labeledAmount;
    } else if (yen) {
      patch.amount = Number(yen[1]);
    }

    var dates = [];
    var dateRe = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g;
    var dm;
    while ((dm = dateRe.exec(src))) dates.push(iso(+dm[1], +dm[2], +dm[3]));
    var due = src.match(/(?:尾款截止|截止|补款)\s*[:：]?\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (due) patch.balanceDueOn = iso(+due[1], +due[2], +due[3]);
    if (dates.length) {
      patch.date = dates[0] === patch.balanceDueOn && dates[1] ? dates[1] : dates[0];
      if (patch.balanceDueOn && patch.date === patch.balanceDueOn && dates.length > 1) {
        patch.date = dates.find(function (d) { return d !== patch.balanceDueOn; }) || dates[0];
      }
    }

    var giftLine = firstMatch(src, /赠品[^:\n]*[:：]\s*([^\n]{1,80})/);
    if (giftLine) patch.gifts = splitGifts(giftLine);

    var bodyForCat = src.split("\n").filter(function (line) { return !/赠品/.test(line); }).join("\n");
    var catWords = [
      ["约妆", "妆面"], ["妆面", "妆面"], ["手组", "手组/改造"], ["改造", "手组/改造"],
      ["假发", "假发"], ["发片", "假发"], ["眼珠", "眼珠"], ["鞋子", "鞋子"], ["娃鞋", "鞋子"],
      ["配饰", "配饰/小物"], ["道具", "道具"], ["素体", "素体"], ["娃衣", "娃衣"],
      ["娃头", "娃头"], ["脸片", "脸片"], ["整娃", "整娃"], ["裸娃", "整娃"]
    ];
    var labeledCat = firstMatch(bodyForCat, /分类\s*[:：]\s*([^\n]{1,12})/);
    if (labeledCat) {
      patch.category = categoryFrom(labeledCat, labeledCat);
    } else {
      for (var c = 0; c < catWords.length; c++) {
        if (bodyForCat.indexOf(catWords[c][0]) >= 0) {
          patch.category = catWords[c][1];
          break;
        }
      }
    }

    if (saleContext && (patch.saleAmount != null || patch.saleContent)) patch.status = "已出";
    else if (/已收货|已到货|确认收货/.test(flat)) patch.status = "已到";
    else if (/待发货|未发货|待发/.test(flat)) patch.status = "待发货";
    else if (patch.balanceDue != null || /待付尾款|尾款未付|待补款/.test(flat)) patch.status = "待尾款";
    else if (patch.deposit != null) patch.status = "已付定";

    if (patch.amount == null && patch.saleAmount == null && patch.deposit == null) {
      warnings.push("没有认出金额，请手填");
    }
    if (!patch.project && !patch.itemName) warnings.push("没有认出企划或名字");
    return { patch: patch, warnings: warnings };
  }

  function applyVisionObject(obj) {
    if (!obj || typeof obj !== "object") throw new Error("视觉模型没有返回字段");
    var e = normalizeEntry(obj);
    var patch = {};
    ["category", "acquisition", "date", "project", "maker", "itemName", "tier", "size", "skin", "material", "status", "saleContent", "remainContent", "note", "depositPaidOn", "balanceDueOn"].forEach(function (k) {
      if (text(obj[k])) patch[k] = e[k];
    });
    ["qty", "amount", "shipping", "proxyFee", "deposit", "balanceDue", "saleQty", "saleAmount"].forEach(function (k) {
      if (!isBlankNum(obj[k]) && e[k] != null) patch[k] = e[k];
    });
    if (Array.isArray(obj.gifts) && obj.gifts.length) patch.gifts = e.gifts;
    else if (text(obj.gifts)) patch.gifts = e.gifts;
    return patch;
  }

  var DIMS = [
    ["category", "分类"],
    ["maker", "出品"],
    ["month", "月份"],
    ["size", "尺寸"],
    ["status", "状态"],
    ["acquisition", "入手"],
    ["project", "企划"],
    ["tier", "档位"]
  ];
  var METRICS = [
    ["spent", "支出合计"],
    ["recouped", "回血合计"],
    ["net", "净额合计"],
    ["qty", "购买数量"],
    ["count", "笔数"]
  ];

  function dimLabel(dim) {
    for (var i = 0; i < DIMS.length; i++) if (DIMS[i][0] === dim) return DIMS[i][1];
    return dim || "维度";
  }

  function pivotMatrix(entries, rowDim, colDim, metric) {
    var p = pivot(entries || [], rowDim, colDim, metric);
    var header = [dimLabel(rowDim)].concat(p.cols, ["合计"]);
    var colTotals = p.cols.map(function () { return 0; });
    var body = p.rows.map(function (r) {
      var rowTotal = 0;
      var cells = p.cols.map(function (c, i) {
        var n = cellAt(p, r, c);
        rowTotal += n;
        colTotals[i] += n;
        return n;
      });
      return [r].concat(cells, [rowTotal]);
    });
    var grand = colTotals.reduce(function (sum, n) { return sum + n; }, 0);
    return [header].concat(body, [["合计"].concat(colTotals, [grand])]);
  }

  function uniqueSheetName(name, used) {
    var cleaned = String(name || "透视").replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "透视";
    if (cleaned.length > 31) cleaned = cleaned.slice(0, 31);
    var base = cleaned;
    var n = 2;
    while (used[cleaned]) {
      var suffix = "-" + n;
      cleaned = base.slice(0, 31 - suffix.length) + suffix;
      n += 1;
    }
    used[cleaned] = true;
    return cleaned;
  }

  function sheetFromMatrix(matrix) {
    var X = getXLSX();
    var ws = X.utils.aoa_to_sheet(matrix);
    if (ws["!ref"]) {
      var range = X.utils.decode_range(ws["!ref"]);
      for (var r = 1; r <= range.e.r; r++) {
        for (var c = 1; c <= range.e.c; c++) {
          var addr = X.utils.encode_cell({ r: r, c: c });
          var cell = ws[addr];
          var value = cell && cell.v != null && cell.v !== "" ? Number(cell.v) : 0;
          if (!isFinite(value)) value = 0;
          ws[addr] = { t: "n", v: value };
        }
      }
    }
    ws["!cols"] = (matrix[0] || []).map(function (head, i) {
      var width = String(head == null ? "" : head).length;
      matrix.forEach(function (row) {
        var len = row[i] == null ? 0 : String(row[i]).length;
        if (len > width) width = len;
      });
      return { wch: Math.min(28, Math.max(8, width + 2)) };
    });
    return ws;
  }

  function buildPivotWorkbook(entries, options) {
    var X = getXLSX();
    var opts = options || {};
    var rowDim = opts.row || "category";
    var colDim = opts.col || "size";
    var metric = opts.metric || "spent";
    var list = entries || [];
    var wb = X.utils.book_new();
    var used = {};
    function append(name, ws) {
      X.utils.book_append_sheet(wb, ws, uniqueSheetName(name, used));
    }
    if (opts.allDims) {
      DIMS.forEach(function (pair) {
        append(pair[1], sheetFromMatrix(pivotMatrix(list, pair[0], colDim, metric)));
      });
    } else {
      append("按" + dimLabel(rowDim), sheetFromMatrix(pivotMatrix(list, rowDim, colDim, metric)));
      append("明细", X.utils.aoa_to_sheet(entriesToMatrix(list)));
    }
    return X.write(wb, { bookType: "xlsx", type: "array" });
  }

  function pivotFileName(rowDim, date, allDims) {
    var d = date || new Date();
    var day = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    if (allDims) return "匣记-透视-全部维度-" + day + ".xlsx";
    return "匣记-透视-按" + dimLabel(rowDim) + "-" + day + ".xlsx";
  }

  var VISION_PROMPT = [
    "你在帮一位球关节人偶（BJD）收藏者记账。从这张截图提取账目，只输出一个 JSON 对象，不要解释。",
    "截图可能是购物订单、众筹/摩点定金或尾款、或闲鱼出物。",
    "如果是购买或众筹付款：价格写入 amount（商品金额，不含邮费），邮费写入 shipping，定金 deposit，尾款 balanceDue。",
    "如果是闲鱼/转卖/出物：价格写入 saleAmount，卖出的东西写入 saleContent，不要把卖价写进 amount。",
    "分类 category 只能是：整娃、娃头、素体、娃衣、假发、眼珠、鞋子、配饰/小物、妆面、手组/改造、道具、脸片、其他。",
    "入手 acquisition 只能是：现货、预定、众筹、闲鱼、代购、赠送 之一，不确定就空字符串。",
    "状态 status 只能是：已付定、待尾款、待发货、已到、部分出、已出。看到未付尾款用待尾款。",
    "日期格式 YYYY-MM-DD。赠品 gifts 是字符串数组，例如 白膜头、空白脸(素头)、水贴、手组支架。",
    "字段：category, acquisition, date, project, maker, itemName, qty, amount, tier, size, skin, material, shipping, proxyFee, deposit, depositPaidOn, balanceDue, balanceDueOn, status, gifts, saleContent, saleQty, saleAmount, remainContent, note。",
    "认不出的字段用 null 或空字符串，不要编造。"
  ].join("");

  return {
    CATEGORIES: CATEGORIES,
    ACQUISITIONS: ACQUISITIONS,
    STATUSES: STATUSES,
    SIZES: SIZES,
    SKINS: SKINS,
    MATERIALS: MATERIALS,
    TIERS: TIERS,
    GIFT_PRESETS: GIFT_PRESETS,
    EXPORT_HEADERS: EXPORT_HEADERS,
    DIMS: DIMS,
    METRICS: METRICS,
    blankEntry: blankEntry,
    num: num,
    spent: spent,
    pending: pending,
    recouped: recouped,
    net: net,
    goodsPaid: goodsPaid,
    feeParts: feeParts,
    splitGifts: splitGifts,
    normalizeEntry: normalizeEntry,
    stamp: stamp,
    summarize: summarize,
    pivot: pivot,
    pivotMatrix: pivotMatrix,
    buildPivotWorkbook: buildPivotWorkbook,
    pivotFileName: pivotFileName,
    cellAt: cellAt,
    dimValue: dimValue,
    parseWorkbook: parseWorkbook,
    parseArrayBuffer: parseArrayBuffer,
    parseOriginal: parseOriginal,
    entriesToMatrix: entriesToMatrix,
    exportEnvelope: exportEnvelope,
    importEnvelope: importEnvelope,
    publicEntry: publicEntry,
    parseOcrText: parseOcrText,
    applyVisionObject: applyVisionObject,
    inferStatus: inferStatus,
    formatDate: formatDate,
    VISION_PROMPT: VISION_PROMPT
  };
});
