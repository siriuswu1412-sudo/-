/* 匣记规则引擎。只在浏览器里对账目求值，不访问服务器。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BJDRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var OPS = ["lit", "field", "ref", "add", "sub", "max"];
  var COPS = ["always", "statusIn", "present", "absent", "and", "or", "not", "measureGt", "textPresent"];

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = typeof v === "number" ? v : Number(String(v).replace(/[,，¥￥\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function blank(v) {
    return v === null || v === undefined || v === "";
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function lit(value) { return { op: "lit", value: value }; }
  function field(name) { return { op: "field", field: name }; }
  function ref(name) { return { op: "ref", name: name }; }
  function add(args) { return { op: "add", args: args }; }
  function sub(a, b) { return { op: "sub", args: [a, b] }; }
  function max(args) { return { op: "max", args: args }; }

  function rule(partial) {
    return {
      id: partial.id,
      description: partial.description,
      enabled: partial.enabled !== false,
      target: partial.target,
      condition: partial.condition || { op: "always" },
      formula: partial.formula || lit(0),
      groupBy: partial.groupBy || "",
      metrics: partial.metrics || null,
      builtin: partial.builtin !== false
    };
  }

  function defaultRules() {
    var waiting = { op: "statusIn", values: ["待尾款", "已付定"] };
    var notWaiting = { op: "not", arg: waiting };
    return [
      rule({
        id: "goods-paid-amount",
        description: "现货或已到货：已付货款取商品金额",
        target: "goodsPaid",
        condition: { op: "and", args: [notWaiting, { op: "present", field: "amount" }] },
        formula: field("amount")
      }),
      rule({
        id: "goods-paid-parts",
        description: "没有商品金额时，已付货款用定金加尾款",
        target: "goodsPaid",
        condition: { op: "and", args: [notWaiting, { op: "absent", field: "amount" }, { op: "or", args: [{ op: "present", field: "deposit" }, { op: "present", field: "balanceDue" }] }] },
        formula: add([field("deposit"), field("balanceDue")])
      }),
      rule({
        id: "goods-paid-deposit",
        description: "待尾款或已付定时，已填定金就只计定金",
        target: "goodsPaid",
        condition: { op: "and", args: [waiting, { op: "present", field: "deposit" }] },
        formula: field("deposit")
      }),
      rule({
        id: "goods-paid-remainder",
        description: "待尾款且没写定金时，已付货款 = 金额 − 尾款",
        target: "goodsPaid",
        condition: { op: "and", args: [waiting, { op: "absent", field: "deposit" }, { op: "present", field: "amount" }, { op: "present", field: "balanceDue" }] },
        formula: max([lit(0), sub(field("amount"), field("balanceDue"))])
      }),
      rule({
        id: "goods-paid-waiting-amount",
        description: "待尾款但还没拆定金和尾款时，先按商品金额计已付",
        target: "goodsPaid",
        condition: { op: "and", args: [waiting, { op: "absent", field: "deposit" }, { op: "absent", field: "balanceDue" }, { op: "present", field: "amount" }] },
        formula: field("amount")
      }),
      rule({
        id: "shipping",
        description: "邮费计入支出",
        target: "shipping",
        formula: field("shipping")
      }),
      rule({
        id: "proxy-fee",
        description: "代购费计入支出",
        target: "proxyFee",
        formula: field("proxyFee")
      }),
      rule({
        id: "spent",
        description: "支出 = 已付货款 + 邮费 + 代购费",
        target: "spent",
        formula: add([ref("goodsPaid"), ref("shipping"), ref("proxyFee")])
      }),
      rule({
        id: "recouped",
        description: "回血取卖出金额",
        target: "recouped",
        formula: field("saleAmount")
      }),
      rule({
        id: "net",
        description: "净额 = 回血 − 支出",
        target: "net",
        formula: sub(ref("recouped"), ref("spent"))
      }),
      rule({
        id: "pending-gap",
        description: "待尾款且没写尾款数字时，待付 = 金额 − 定金",
        target: "pending",
        condition: { op: "and", args: [waiting, { op: "absent", field: "balanceDue" }, { op: "present", field: "amount" }, { op: "present", field: "deposit" }] },
        formula: max([lit(0), sub(field("amount"), field("deposit"))])
      }),
      rule({
        id: "pending-balance",
        description: "待尾款或已付定时，待付尾款取尾款数字",
        target: "pending",
        condition: { op: "and", args: [waiting, { op: "present", field: "balanceDue" }] },
        formula: field("balanceDue")
      }),
      rule({
        id: "qty",
        description: "购买数量",
        target: "qty",
        formula: field("qty")
      }),
      rule({
        id: "sale-flag",
        description: "有回血或写了出物内容，记一笔出物",
        target: "saleFlag",
        condition: { op: "or", args: [{ op: "measureGt", name: "recouped", value: 0 }, { op: "textPresent", field: "saleContent" }] },
        formula: lit(1)
      }),
      rule({
        id: "count-entry",
        description: "每一笔记 1 笔",
        target: "countItem",
        formula: lit(1)
      }),
      rule({ id: "group-category", description: "按分类汇总", target: "group", groupBy: "category", metrics: ["spent", "recouped", "net", "count", "qty"] }),
      rule({ id: "group-maker", description: "按出品汇总", target: "group", groupBy: "maker", metrics: ["spent", "recouped", "net", "count"] }),
      rule({ id: "group-month", description: "按月份汇总", target: "group", groupBy: "month", metrics: ["spent", "recouped", "net", "count"] }),
      rule({ id: "group-size", description: "按尺寸汇总", target: "group", groupBy: "size", metrics: ["spent", "recouped", "net", "count"] }),
      rule({ id: "group-gift", description: "按赠品计数", target: "group", groupBy: "gifts", metrics: ["count"] })
    ].map(function (item) { return rule(item); });
  }

  function checkFormula(formula, path) {
    if (!formula || typeof formula !== "object" || OPS.indexOf(formula.op) < 0) {
      throw new Error((path || "公式") + "无法识别");
    }
    if (formula.op === "add" || formula.op === "sub" || formula.op === "max") {
      if (!Array.isArray(formula.args) || !formula.args.length) throw new Error((path || "公式") + "缺少参数");
      formula.args.forEach(function (arg, i) { checkFormula(arg, (path || "公式") + "[" + i + "]"); });
    }
    if ((formula.op === "field" || formula.op === "ref") && !formula.field && !formula.name && formula.op === "field" && !formula.field) {
      throw new Error("字段名为空");
    }
    if (formula.op === "field" && !formula.field) throw new Error("字段名为空");
    if (formula.op === "ref" && !formula.name) throw new Error("引用名为空");
  }

  function checkCondition(cond, path) {
    if (!cond) return;
    if (typeof cond !== "object" || COPS.indexOf(cond.op) < 0) throw new Error((path || "条件") + "无法识别");
    if (cond.op === "and" || cond.op === "or") {
      if (!Array.isArray(cond.args)) throw new Error("组合条件缺少参数");
      cond.args.forEach(function (arg, i) { checkCondition(arg, "条件[" + i + "]"); });
    }
    if (cond.op === "not") checkCondition(cond.arg, "条件");
    if (cond.op === "statusIn" && !Array.isArray(cond.values)) throw new Error("状态条件缺少列表");
  }

  function validate(input) {
    if (!input || typeof input !== "object") throw new Error("规则不是对象");
    if (!input.id || !String(input.id).trim()) throw new Error("规则缺少 id");
    if (!input.description) throw new Error("规则缺少说明");
    if (!input.target) throw new Error("规则缺少 target");
    if (input.target === "group") {
      if (!input.groupBy) throw new Error("汇总规则缺少 groupBy");
      return true;
    }
    checkCondition(input.condition || { op: "always" }, "条件");
    checkFormula(input.formula || lit(0), "公式");
    return true;
  }

  function normalizeRule(input) {
    validate(input);
    return {
      id: String(input.id).trim(),
      description: String(input.description).trim(),
      enabled: input.enabled !== false,
      target: String(input.target),
      condition: input.condition || { op: "always" },
      formula: input.formula || lit(0),
      groupBy: input.groupBy || "",
      metrics: input.metrics || null,
      builtin: !!input.builtin
    };
  }

  function merge(saved) {
    var base = defaultRules();
    var list = Array.isArray(saved) ? saved : [];
    var byId = {};
    list.forEach(function (item) {
      if (item && item.id) byId[item.id] = item;
    });
    var merged = base.map(function (item) {
      var over = byId[item.id];
      if (!over) return item;
      var next = clone(item);
      if (typeof over.enabled === "boolean") next.enabled = over.enabled;
      if (over.description) next.description = over.description;
      if (over.condition) next.condition = over.condition;
      if (over.formula) next.formula = over.formula;
      if (over.target) next.target = over.target;
      if (over.groupBy) next.groupBy = over.groupBy;
      if (over.metrics) next.metrics = over.metrics;
      next.builtin = true;
      return next;
    });
    list.forEach(function (item) {
      if (!item || !item.id) return;
      if (base.some(function (b) { return b.id === item.id; })) return;
      var custom = normalizeRule(item);
      custom.builtin = false;
      merged.push(custom);
    });
    return merged;
  }

  function matchCondition(cond, ctx) {
    if (!cond || cond.op === "always") return true;
    var op = cond.op;
    if (op === "statusIn") return (cond.values || []).indexOf(ctx.entry.status) >= 0;
    if (op === "present") return !blank(ctx.entry[cond.field]);
    if (op === "absent") return blank(ctx.entry[cond.field]);
    if (op === "and") return (cond.args || []).every(function (item) { return matchCondition(item, ctx); });
    if (op === "or") return (cond.args || []).some(function (item) { return matchCondition(item, ctx); });
    if (op === "not") return !matchCondition(cond.arg, ctx);
    if (op === "measureGt") return num(ctx.measures[cond.name]) > num(cond.value);
    if (op === "textPresent") return String(ctx.entry[cond.field] || "").trim().length > 0;
    return false;
  }

  function evalFormula(formula, ctx) {
    if (!formula) return 0;
    if (formula.op === "lit") return num(formula.value);
    if (formula.op === "field") return num(ctx.entry[formula.field]);
    if (formula.op === "ref") return num(ctx.measures[formula.name]);
    if (formula.op === "add") {
      return (formula.args || []).reduce(function (sum, arg) { return sum + evalFormula(arg, ctx); }, 0);
    }
    if (formula.op === "sub") {
      var args = formula.args || [];
      var rest = args.slice(1).reduce(function (sum, arg) { return sum + evalFormula(arg, ctx); }, 0);
      return evalFormula(args[0], ctx) - rest;
    }
    if (formula.op === "max") {
      var vals = (formula.args || []).map(function (arg) { return evalFormula(arg, ctx); });
      return vals.length ? Math.max.apply(null, vals) : 0;
    }
    return 0;
  }

  function groupKey(entry, groupBy) {
    if (groupBy === "month") return entry.date ? String(entry.date).slice(0, 7) : "未填日期";
    if (groupBy === "maker") return entry.maker || "未填出品";
    if (groupBy === "size") return entry.size || "未填尺寸";
    if (groupBy === "category") return entry.category || "其他";
    if (groupBy === "gifts") return null;
    var value = entry[groupBy];
    return value ? String(value) : "未填";
  }

  function emptyBucket() {
    return { spent: 0, recouped: 0, net: 0, count: 0, qty: 0, pending: 0 };
  }

  function addBucket(bucket, row, metrics) {
    var use = metrics || ["spent", "recouped", "net", "count", "qty", "pending"];
    if (use.indexOf("spent") >= 0) bucket.spent += num(row.measures.spent);
    if (use.indexOf("recouped") >= 0) bucket.recouped += num(row.measures.recouped);
    if (use.indexOf("net") >= 0) bucket.net += num(row.measures.net);
    if (use.indexOf("count") >= 0) bucket.count += 1;
    if (use.indexOf("qty") >= 0) bucket.qty += num(row.measures.qty);
    if (use.indexOf("pending") >= 0) bucket.pending += num(row.measures.pending);
  }

  var activeRules = null;
  function setActive(rules) { activeRules = rules ? clone(rules) : null; }
  function getActive() { return activeRules ? clone(activeRules) : defaultRules(); }

  function evaluate(entries, rules) {
    var list = rules ? clone(rules) : getActive();
    var enabled = list.filter(function (item) { return item.enabled !== false && item.target !== "group"; });
    var groupsSpec = list.filter(function (item) { return item.enabled !== false && item.target === "group"; });
    var rows = (entries || []).map(function (entry) {
      var ctx = { entry: entry, measures: { goodsPaid: 0, shipping: 0, proxyFee: 0, spent: 0, recouped: 0, net: 0, pending: 0, qty: 0, saleFlag: 0, countItem: 0 }, ruleIds: {} };
      enabled.forEach(function (item) {
        if (!matchCondition(item.condition, ctx)) return;
        ctx.measures[item.target] = evalFormula(item.formula, ctx);
        var chain = ctx.ruleIds[item.target] ? ctx.ruleIds[item.target].slice() : [];
        chain.push(item.id);
        Object.keys(ctx.ruleIds).forEach(function (name) {
          if (item.formula && JSON.stringify(item.formula).indexOf('"name":"' + name + '"') >= 0) {
            ctx.ruleIds[name].forEach(function (id) {
              if (chain.indexOf(id) < 0) chain.push(id);
            });
          }
        });
        ctx.ruleIds[item.target] = chain;
      });
      return { id: entry.id, entry: entry, measures: ctx.measures, ruleIds: ctx.ruleIds };
    });

    var groups = {};
    groupsSpec.forEach(function (spec) {
      var bucket = {};
      rows.forEach(function (row) {
        if (spec.groupBy === "gifts") {
          var gifts = Array.isArray(row.entry.gifts) ? row.entry.gifts : [];
          gifts.forEach(function (gift) {
            if (!bucket[gift]) bucket[gift] = emptyBucket();
            addBucket(bucket[gift], row, spec.metrics);
          });
          return;
        }
        var key = groupKey(row.entry, spec.groupBy);
        if (!bucket[key]) bucket[key] = emptyBucket();
        addBucket(bucket[key], row, spec.metrics);
      });
      groups[spec.groupBy] = bucket;
    });

    var totals = { count: 0, qty: 0, spent: 0, recouped: 0, net: 0, pending: 0, saleCount: 0, goodsPaid: 0, shipping: 0, proxyFee: 0 };
    rows.forEach(function (row) {
      totals.count += num(row.measures.countItem);
      totals.qty += num(row.measures.qty);
      totals.spent += num(row.measures.spent);
      totals.recouped += num(row.measures.recouped);
      totals.net += num(row.measures.net);
      totals.pending += num(row.measures.pending);
      totals.saleCount += num(row.measures.saleFlag);
      totals.goodsPaid += num(row.measures.goodsPaid);
      totals.shipping += num(row.measures.shipping);
      totals.proxyFee += num(row.measures.proxyFee);
    });

    var trace = {};
    ["spent", "recouped", "net", "pending", "goodsPaid", "shipping", "proxyFee"].forEach(function (metric) {
      trace[metric] = traceFor(rows, list, metric);
    });

    return { rows: rows, totals: totals, groups: groups, trace: trace, rules: list };
  }

  function traceFor(rows, rules, metric, pred) {
    var byId = {};
    rules.forEach(function (item) { byId[item.id] = item; });
    var seen = {};
    var used = [];
    var matched = [];
    rows.forEach(function (row) {
      if (pred && !pred(row)) return;
      var ids = row.ruleIds[metric] || [];
      ids.forEach(function (id) {
        if (seen[id]) return;
        seen[id] = true;
        var item = byId[id];
        used.push({ id: id, description: item ? item.description : id, target: item ? item.target : "" });
      });
      matched.push({
        id: row.id,
        date: row.entry.date || "",
        label: row.entry.itemName || row.entry.project || "未命名",
        project: row.entry.project || "",
        category: row.entry.category || "",
        maker: row.entry.maker || "",
        value: num(row.measures[metric]),
        rules: ids
      });
    });
    matched.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    return { rules: used, entries: matched };
  }

  function summarize(entries, rules) {
    var report = evaluate(entries, rules);
    return {
      count: report.totals.count,
      qty: report.totals.qty,
      spent: report.totals.spent,
      recouped: report.totals.recouped,
      net: report.totals.net,
      pending: report.totals.pending,
      saleCount: report.totals.saleCount,
      byCategory: report.groups.category || {},
      byMaker: report.groups.maker || {},
      byMonth: report.groups.month || {},
      bySize: report.groups.size || {},
      byGift: report.groups.gifts || {}
    };
  }

  function measure(entry, rules) {
    return evaluate([entry], rules).rows[0].measures;
  }

  function exportDoc(rules) {
    return { app: "匣记", kind: "rules", version: 1, rules: clone(rules || getActive()) };
  }

  function importDoc(obj) {
    var list = obj;
    if (obj && !Array.isArray(obj) && Array.isArray(obj.rules)) list = obj.rules;
    if (!Array.isArray(list)) throw new Error("JSON 里没有规则");
    return merge(list.map(normalizeRule));
  }

  return {
    defaultRules: defaultRules,
    merge: merge,
    validate: validate,
    normalizeRule: normalizeRule,
    evaluate: evaluate,
    summarize: summarize,
    measure: measure,
    traceFor: traceFor,
    setActive: setActive,
    getActive: getActive,
    exportDoc: exportDoc,
    importDoc: importDoc
  };
});
