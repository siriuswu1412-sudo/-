/* 匣记界面。数据只写在这台浏览器里，导出不含视觉模型密钥。 */
(function () {
  var VIEWS = ["dash", "list", "entry", "rules", "pivot", "data"];
  var state = {
    entries: [],
    db: null,
    storage: "idb",
    view: "dash",
    ready: false,
    error: "",
    charts: [],
    editingId: null,
    entryMode: "manual",
    imageFile: null,
    imageUrl: "",
    visionKey: "",
    filters: { q: "", category: "", status: "", sort: "date-desc" },
    dashFilter: { from: "", to: "", category: "" },
    rules: null,
    trace: null,
    pivot: { row: "category", col: "size", metric: "spent" }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(n) {
    var v = Number(n) || 0;
    var neg = v < -0.0001;
    var abs = Math.abs(v);
    var digits = Math.abs(abs - Math.round(abs)) < 0.001 ? 0 : 2;
    var s = abs.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: 2 });
    return (neg ? "−¥" : "¥") + s;
  }

  function fmtCell(metric, n) {
    if (!n) return "·";
    if (metric === "count" || metric === "qty") {
      var digits = Math.abs(n - Math.round(n)) < 0.001 ? 0 : 2;
      return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: digits });
    }
    return fmt(n);
  }

  function uid() {
    return "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2800);
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("xiaji", 2);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "id" });
        if (!db.objectStoreNames.contains("rules")) db.createObjectStore("rules", { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbAll(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("entries", "readonly");
      var req = tx.objectStore("entries").getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPutAll(db, entries) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("entries", "readwrite");
      var store = tx.objectStore("entries");
      entries.forEach(function (e) { store.put(e); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function idbClear(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function idbGet(db, store, id) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, "readonly");
      var req = tx.objectStore(store).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(db, store, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function idbDelete(db, id) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function saveLocal(entries) {
    localStorage.setItem("xiaji.entries.v1", JSON.stringify(entries));
  }

  async function loadEntries() {
    try {
      var db = await openDB();
      state.db = db;
      state.storage = "idb";
      var rows = await idbAll(db);
      return rows.map(BJD.normalizeEntry);
    } catch (err) {
      state.storage = "local";
      var raw = localStorage.getItem("xiaji.entries.v1");
      if (raw) return JSON.parse(raw).map(BJD.normalizeEntry);
      return [];
    }
  }

  async function persistAll(entries) {
    if (state.db) {
      await idbClear(state.db);
      if (entries.length) await idbPutAll(state.db, entries);
      return;
    }
    saveLocal(entries);
  }

  async function persistOne(entry) {
    if (state.db) {
      await idbPutAll(state.db, [entry]);
      return;
    }
    var next = state.entries.filter(function (e) { return e.id !== entry.id; }).concat([entry]);
    saveLocal(next);
  }

  async function persistDelete(id) {
    if (state.db) {
      await idbDelete(state.db, id);
      return;
    }
    saveLocal(state.entries.filter(function (e) { return e.id !== id; }));
  }

  function viewFromHash() {
    var raw = (location.hash || "").replace(/^#\/?/, "");
    if (!raw) return "dash";
    return VIEWS.indexOf(raw) >= 0 ? raw : "dash";
  }

  function go(view, extra) {
    if (VIEWS.indexOf(view) < 0) view = "dash";
    if (view === "entry") state.editingId = extra && extra.edit ? extra.edit : null;
    else state.editingId = null;
    var next = "#/" + view;
    if (location.hash !== next) location.hash = next;
    else {
      state.view = view;
      render();
    }
  }

  function clearCharts() {
    (state.charts || []).forEach(function (c) { c.destroy(); });
    state.charts = [];
  }

  function render() {
    clearCharts();
    var main = document.getElementById("main");
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.classList.toggle("active", a.dataset.nav === state.view);
    });
    var pill = document.getElementById("count-pill");
    if (pill) pill.textContent = state.entries.length + " 笔 · 只存在这台浏览器";
    if (state.error) {
      main.innerHTML = '<div class="empty"><h2>账本没有打开</h2><p>' + esc(state.error) + "</p></div>";
      return;
    }
    if (window.BJDRules) BJDRules.setActive(state.rules);
    if (state.view === "dash") renderDash(main);
    else if (state.view === "list") renderList(main);
    else if (state.view === "entry") renderEntry(main);
    else if (state.view === "rules") renderRules(main);
    else if (state.view === "pivot") renderPivot(main);
    else renderData(main);
  }

  function topKey(bucket) {
    return Object.keys(bucket).sort(function (a, b) { return bucket[b].spent - bucket[a].spent; })[0] || "";
  }

  function dashEntries() {
    var f = state.dashFilter;
    return state.entries.filter(function (e) {
      if (f.category && e.category !== f.category) return false;
      if (f.from && (!e.date || e.date < f.from)) return false;
      if (f.to && (!e.date || e.date > f.to)) return false;
      return true;
    });
  }

  function activeRules() {
    return state.rules || (window.BJDRules ? BJDRules.defaultRules() : []);
  }

  async function loadRules() {
    if (!window.BJDRules) return null;
    try {
      if (state.db && state.db.objectStoreNames.contains("rules")) {
        var saved = await idbGet(state.db, "rules", "set");
        if (saved && Array.isArray(saved.rules)) return BJDRules.merge(saved.rules);
      }
    } catch (e) { /* 用内置规则 */ }
    var local = localStorage.getItem("xiaji.rules.v1");
    if (local) {
      try { return BJDRules.merge(JSON.parse(local).rules || JSON.parse(local)); } catch (err) { return BJDRules.defaultRules(); }
    }
    return BJDRules.defaultRules();
  }

  async function saveRules(rules) {
    state.rules = rules;
    if (window.BJDRules) BJDRules.setActive(rules);
    var doc = BJDRules.exportDoc(rules);
    if (state.db && state.db.objectStoreNames.contains("rules")) await idbPut(state.db, "rules", { id: "set", rules: doc.rules });
    else localStorage.setItem("xiaji.rules.v1", JSON.stringify(doc));
  }

  function renderDash(main) {
    var entries = dashEntries();
    var report = window.BJDRules ? BJDRules.evaluate(entries, activeRules()) : null;
    var summary = report ? {
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
    } : BJD.summarize(entries);
    state.report = report;
    if (!state.entries.length) {
      main.innerHTML = '<div class="empty"><h2>账本还是空的</h2><p>可以从手写、截图，或原来的 Excel 记起。</p><div class="actions"><a class="btn" href="#/entry" data-nav="entry">记一笔</a><a class="btn ghost" href="#/data" data-nav="data">导入表格</a></div></div>';
      return;
    }
    var fees = report ? { goods: report.totals.goodsPaid, ship: report.totals.shipping, proxy: report.totals.proxyFee } : BJD.feeParts(entries);
    var pack = {
      category: seriesFrom(summary.byCategory, { preset: BJD.CATEGORIES.concat(["其他"]) }),
      maker: seriesFrom(summary.byMaker, { limit: 8 }),
      month: seriesFrom(summary.byMonth),
      size: seriesFrom(summary.bySize, { preset: BJD.SIZES.concat(["未填尺寸"]) }),
      gift: giftSeries(summary.byGift || {})
    };
    var spentSub = "货款 " + fmt(fees.goods);
    if (fees.ship) spentSub += " · 邮费 " + fmt(fees.ship);
    if (fees.proxy) spentSub += " · 代购 " + fmt(fees.proxy);
    var netClass = summary.net < -0.001 ? "bad" : summary.net > 0.001 ? "good" : "";
    var f = state.dashFilter;
    main.innerHTML =
      fold("筛选图表", '<div class="toolbar">' +
        '<label class="field"><span>从</span><input id="dash-from" type="date" value="' + esc(f.from) + '"></label>' +
        '<label class="field"><span>到</span><input id="dash-to" type="date" value="' + esc(f.to) + '"></label>' +
        '<label class="field"><span>分类</span><select id="dash-cat">' + optionsHTML(BJD.CATEGORIES, f.category, "全部分类") + "</select></label>" +
      "</div>") +
      '<section class="kpi-grid" id="kpi-grid">' +
      kpi("已花费", summary.spent, "", spentSub, "spent") +
      kpi("已回血", summary.recouped, "good", summary.saleCount + " 笔写了出物或回血", "recouped") +
      kpi("净额", summary.net, netClass, "回血减支出", "net") +
      kpi("待付尾款", summary.pending, "warn", "已付定、待尾款里还没付的部分", "pending") +
      "</section>" +
      '<section id="trace" class="panel"' + (state.trace ? "" : " hidden") + ">" + traceHTML(report) + "</section>" +
      '<p class="insight">' + esc(summary.count ? ("花费最高的分类是" + topKey(summary.byCategory) + "，出品方里 " + topKey(summary.byMaker) + " 最多，尺寸上 " + topKey(summary.bySize) + " 占大头。点上面的数字可看规则和账目。") : "这个筛选下没有账。") + "</p>" +
      '<section class="chart-grid">' +
      chartCard("分类占比", "chart-cat", pack.category, "spent") +
      chartCard("月份趋势", "chart-month", pack.month, "both") +
      chartCard("累计净额", "chart-cum", cumulative(pack.month), "net") +
      chartCard("出品前 8", "chart-maker", pack.maker, "spent") +
      chartCard("按尺寸", "chart-size", pack.size, "spent") +
      chartCard("赠品", "chart-gift", pack.gift, "count") +
      "</section>" +
      '<article class="chart-card"><h3>分类 × 尺寸</h3><p class="scroll-hint">左右滑动查看热力表</p>' + heatmapHTML(entries) + "</article>" +
      '<p class="footnote">数字全部由规则引擎算出。支出 = 已付货款 + 邮费 + 代购费。待付尾款不重复计入支出。</p>';
    bindDash();
    mountCharts(pack);
  }

  function giftSeries(bucket) {
    var keys = Object.keys(bucket).sort(function (a, b) { return (bucket[b].count || 0) - (bucket[a].count || 0); }).slice(0, 8);
    return { labels: keys, spent: keys.map(function () { return 0; }), recouped: keys.map(function () { return 0; }), count: keys.map(function (k) { return bucket[k].count || 0; }), net: keys.map(function () { return 0; }) };
  }

  function cumulative(month) {
    var run = 0;
    var net = (month.net || []).map(function (n) { run += n; return run; });
    return { labels: month.labels, spent: month.spent, recouped: month.recouped, net: net, count: month.count || [] };
  }

  function heatmapHTML(entries) {
    var pivot = BJD.pivot(entries, "category", "size", "spent");
    if (!pivot.rows.length) return '<p class="muted">没有可着色的格子。</p>';
    var max = 0;
    pivot.rows.forEach(function (r) {
      pivot.cols.forEach(function (c) { max = Math.max(max, BJD.cellAt(pivot, r, c)); });
    });
    var head = "<tr><th></th>" + pivot.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    var body = pivot.rows.map(function (r) {
      var cells = pivot.cols.map(function (c) {
        var n = BJD.cellAt(pivot, r, c);
        var t = max ? Math.round(n / max * 100) : 0;
        return '<td class="heat" data-heat="' + esc(r) + "|" + esc(c) + '" style="--t:' + t + '%">' + (n ? fmt(n) : "·") + "</td>";
      }).join("");
      return "<tr><th>" + esc(r) + "</th>" + cells + "</tr>";
    }).join("");
    return '<div class="table-wrap"><table class="heat-table"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  function traceHTML(report) {
    if (!state.trace || !report) return "";
    var metric = state.trace.metric;
    var pred = null;
    if (state.trace.category || state.trace.size) {
      pred = function (row) {
        if (state.trace.category && (row.entry.category || "其他") !== state.trace.category) return false;
        if (state.trace.size && (row.entry.size || "未填尺寸") !== state.trace.size) return false;
        return true;
      };
    }
    var trace = BJDRules.traceFor(report.rows, report.rules, metric, pred);
    var title = { spent: "已花费", recouped: "已回血", net: "净额", pending: "待付尾款" }[metric] || metric;
    var where = [state.trace.category, state.trace.size].filter(Boolean).join(" · ");
    var rules = trace.rules.map(function (rule) {
      return "<li><strong>" + esc(rule.id) + "</strong> " + esc(rule.description) + "</li>";
    }).join("") || "<li>没有命中的规则</li>";
    var rows = trace.entries.filter(function (row) { return metric === "count" || row.value !== 0; }).slice(0, 40).map(function (row) {
      return "<li><span>" + esc(row.date || "未填日期") + " " + esc(row.label) + "</span><span class=\"num\">" + fmt(row.value) + "</span></li>";
    }).join("") || "<li>没有账目计入这个数</li>";
    return "<h3>" + esc(title) + (where ? " · " + esc(where) : "") + '</h3><p class="muted">规则</p><ul class="trace-rules">' + rules + '</ul><p class="muted">账目</p><ul class="fig-list">' + rows + "</ul>";
  }

  function bindDash() {
    ["dash-from", "dash-to", "dash-cat"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", function () {
        state.dashFilter.from = document.getElementById("dash-from").value;
        state.dashFilter.to = document.getElementById("dash-to").value;
        state.dashFilter.category = document.getElementById("dash-cat").value;
        state.trace = null;
        render();
      });
    });
    var kpis = document.getElementById("kpi-grid");
    if (kpis) kpis.addEventListener("click", function (e) {
      var card = e.target.closest("[data-metric]");
      if (!card) return;
      var metric = card.dataset.metric;
      state.trace = state.trace && state.trace.metric === metric && !state.trace.category ? null : { metric: metric };
      render();
    });
    var heat = document.querySelector(".heat-table");
    if (heat) heat.addEventListener("click", function (e) {
      var cell = e.target.closest("[data-heat]");
      if (!cell) return;
      var parts = cell.dataset.heat.split("|");
      state.trace = { metric: "spent", category: parts[0], size: parts[1] };
      render();
    });
  }

  function kpi(label, value, cls, sub, key) {
    return '<article class="kpi ' + cls + '" data-metric="' + key + '" tabindex="0"><div class="label">' + esc(label) + '</div><div class="num" id="kpi-' + key + '" data-value="' + value + '">' + fmt(value) + '</div><div class="sub">' + esc(sub) + "</div></article>";
  }

  function seriesFrom(bucket, opts) {
    opts = opts || {};
    var keys = Object.keys(bucket);
    var isMonth = keys.length > 0 && keys.every(function (k) { return k === "未填日期" || /^\d{4}-\d{2}$/.test(k); });
    if (isMonth) {
      keys.sort(function (a, b) {
        if (a === "未填日期") return 1;
        if (b === "未填日期") return -1;
        return a < b ? -1 : 1;
      });
    } else if (opts.preset) {
      keys.sort(function (a, b) {
        var ia = opts.preset.indexOf(a);
        var ib = opts.preset.indexOf(b);
        if (ia < 0) ia = 999;
        if (ib < 0) ib = 999;
        if (ia !== ib) return ia - ib;
        return bucket[b].spent - bucket[a].spent;
      });
    } else {
      keys.sort(function (a, b) { return bucket[b].spent - bucket[a].spent; });
    }
    if (opts.limit && keys.length > opts.limit) keys = keys.slice(0, opts.limit);
    return {
      labels: keys,
      spent: keys.map(function (k) { return bucket[k].spent || 0; }),
      recouped: keys.map(function (k) { return bucket[k].recouped || 0; }),
      net: keys.map(function (k) { return bucket[k].net || 0; }),
      count: keys.map(function (k) { return bucket[k].count || 0; })
    };
  }

  function chartCard(title, id, series, mode) {
    var items = series.labels.map(function (label, i) {
      var text = mode === "both" ? fmt(series.spent[i]) + " / 回血 " + fmt(series.recouped[i])
        : mode === "count" ? String(series.count[i]) + " 次"
        : mode === "net" ? fmt(series.net[i])
        : fmt(series.spent[i]);
      return "<li><span>" + esc(label) + '</span><span class="num">' + text + "</span></li>";
    }).join("");
    return '<article class="chart-card"><h3>' + esc(title) + '</h3><div class="chart-box"><canvas id="' + id + '" aria-label="' + esc(title) + '"></canvas></div><ul class="fig-list">' + items + "</ul></article>";
  }

  function mountCharts(pack) {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#6d6258";
    Chart.defaults.borderColor = "#efe4d6";
    var ink = "#9c3a32";
    var moss = "#246246";
    var gold = "#8a5a2a";
    var palette = ["#9c3a32", "#c46b4a", "#c4a574", "#6e8b74", "#3d5a54", "#4f6d7a", "#8a6a7a", "#b08560", "#6a7a4e", "#8d5a4a"];
    function axisMoney() {
      return { ticks: { callback: function (v) { return fmt(v); }, maxTicksLimit: 5 }, grid: { color: "#f3eadf" } };
    }
    function push(id, config) {
      var canvas = document.getElementById(id);
      if (!canvas) return;
      config.options = config.options || {};
      config.options.responsive = true;
      config.options.maintainAspectRatio = false;
      state.charts.push(new Chart(canvas, config));
    }
    push("chart-cat", {
      type: "doughnut",
      data: { labels: pack.category.labels, datasets: [{ data: pack.category.spent, backgroundColor: palette }] },
      options: { plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: function (c) { return c.label + " " + fmt(c.parsed); } } } } }
    });
    push("chart-month", {
      type: "line",
      data: { labels: pack.month.labels, datasets: [
        { label: "支出", data: pack.month.spent, borderColor: ink, backgroundColor: ink, tension: 0.25 },
        { label: "回血", data: pack.month.recouped, borderColor: moss, backgroundColor: moss, tension: 0.25 }
      ] },
      options: { plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + " " + fmt(c.parsed.y); } } } }, scales: { y: axisMoney(), x: { grid: { display: false } } } }
    });
    push("chart-cum", {
      type: "line",
      data: { labels: pack.month.labels, datasets: [{ label: "累计净额", data: cumulative(pack.month).net, borderColor: gold, backgroundColor: "rgba(138,90,42,.15)", fill: true, tension: 0.25 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return fmt(c.parsed.y); } } } }, scales: { y: axisMoney(), x: { grid: { display: false } } } }
    });
    push("chart-maker", {
      type: "bar",
      data: { labels: pack.maker.labels, datasets: [{ data: pack.maker.spent, backgroundColor: ink, borderRadius: 4, maxBarThickness: 18 }] },
      options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return fmt(c.parsed.x); } } } }, scales: { x: axisMoney(), y: { grid: { display: false }, ticks: { autoSkip: false } } } }
    });
    push("chart-size", {
      type: "bar",
      data: { labels: pack.size.labels, datasets: [{ data: pack.size.spent, backgroundColor: ink, borderRadius: 4 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return fmt(c.parsed.y); } } } }, scales: { y: axisMoney(), x: { grid: { display: false } } } }
    });
    push("chart-gift", {
      type: "bar",
      data: { labels: pack.gift.labels, datasets: [{ data: pack.gift.count, backgroundColor: moss, borderRadius: 4, maxBarThickness: 18 }] },
      options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#f3eadf" }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } }
    });
  }

  function filtered() {
    var q = state.filters.q.trim().toLowerCase();
    var rows = state.entries.filter(function (e) {
      if (state.filters.category && e.category !== state.filters.category) return false;
      if (state.filters.status && e.status !== state.filters.status) return false;
      if (!q) return true;
      var hay = [e.project, e.maker, e.itemName, e.tier, e.size, e.skin, e.saleContent, e.remainContent, e.note, (e.gifts || []).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var sort = state.filters.sort;
    rows.sort(function (a, b) {
      if (sort === "date-asc") return (a.date || "9999").localeCompare(b.date || "9999");
      if (sort === "spent-desc") return BJD.spent(b) - BJD.spent(a);
      if (sort === "net-asc") return BJD.net(a) - BJD.net(b);
      return (b.date || "0000").localeCompare(a.date || "0000") || a.project.localeCompare(b.project, "zh");
    });
    return rows;
  }

  function statusClass(status) {
    if (status === "已付定" || status === "待尾款") return "warn";
    if (status === "已出") return "out";
    if (status === "部分出") return "part";
    return "";
  }

  function rowHTML(e) {
    var title = e.itemName || e.project || "未命名";
    var sub = [e.project && e.itemName ? e.project : "", e.maker, e.size, e.tier].filter(Boolean).join(" · ");
    var net = BJD.net(e);
    return '<tr class="clickable" data-row="' + esc(e.id) + '">' +
      "<td>" + esc(e.date || "—") + "</td>" +
      "<td>" + esc(e.category) + "</td>" +
      '<td><div class="name">' + esc(title) + '</div><div class="sub">' + esc(sub) + "</div></td>" +
      '<td class="num">' + fmt(BJD.spent(e)) + "</td>" +
      '<td class="num">' + (BJD.recouped(e) ? fmt(BJD.recouped(e)) : "·") + "</td>" +
      '<td class="num" style="color:' + (net < 0 ? "var(--cinnabar)" : "var(--moss)") + '">' + fmt(net) + "</td>" +
      '<td><span class="tag ' + statusClass(e.status) + '">' + esc(e.status) + "</span></td>" +
      '<td><div class="row-actions"><button type="button" class="btn ghost small" data-edit="' + esc(e.id) + '">改</button><button type="button" class="btn danger small" data-del="' + esc(e.id) + '">删</button></div></td>' +
      "</tr>";
  }

  function paintRows() {
    var body = document.getElementById("list-body");
    var meta = document.getElementById("list-meta");
    if (!body) return;
    var rows = filtered();
    if (meta) meta.textContent = "显示 " + rows.length + " / " + state.entries.length + " 笔";
    body.innerHTML = rows.length ? rows.map(rowHTML).join("") : '<tr><td colspan="8">没有符合的记录。</td></tr>';
  }

  function fold(title, inner) {
    var open = window.matchMedia("(min-width: 431px)").matches;
    return '<details class="fold"' + (open ? " open" : "") + "><summary>" + esc(title) + '</summary><div class="fold-body">' + inner + "</div></details>";
  }

  function optionsHTML(list, current, allLabel) {
    var html = '<option value="">' + esc(allLabel) + "</option>";
    list.forEach(function (item) {
      html += '<option value="' + esc(item) + '"' + (item === current ? " selected" : "") + ">" + esc(item) + "</option>";
    });
    return html;
  }

  function renderList(main) {
    if (!state.entries.length) {
      main.innerHTML = '<div class="empty"><h2>还没有明细</h2><p>第一笔记下来之后，会按时间排在这里。</p><div class="actions"><a class="btn" href="#/entry" data-nav="entry">记一笔</a></div></div>';
      return;
    }
    var f = state.filters;
    main.innerHTML =
      "<h2>明细</h2>" +
      fold("筛选", '<div class="toolbar">' +
      '<input id="q" type="search" placeholder="搜企划、名字、出品、赠品" value="' + esc(f.q) + '">' +
      '<select id="f-cat">' + optionsHTML(BJD.CATEGORIES, f.category, "全部分类") + "</select>" +
      '<select id="f-status">' + optionsHTML(BJD.STATUSES, f.status, "全部状态") + "</select>" +
      '<select id="f-sort">' +
      ["date-desc:时间新到旧", "date-asc:时间旧到新", "spent-desc:支出从高到低", "net-asc:净额从低到高"].map(function (pair) {
        var p = pair.split(":");
        return '<option value="' + p[0] + '"' + (f.sort === p[0] ? " selected" : "") + ">" + p[1] + "</option>";
      }).join("") +
      "</select></div>") +
      '<p class="muted" id="list-meta"></p>' +
      '<p class="scroll-hint">左右滑动查看整张表</p>' +
      '<div class="table-wrap"><table><thead><tr>' +
      "<th>时间</th><th>分类</th><th>名字</th><th class=\"num\">支出</th><th class=\"num\">回血</th><th class=\"num\">净额</th><th>状态</th><th></th>" +
      '</tr></thead><tbody id="list-body"></tbody></table></div>';
    document.getElementById("q").addEventListener("input", function (e) { state.filters.q = e.target.value; paintRows(); });
    document.getElementById("f-cat").addEventListener("change", function (e) { state.filters.category = e.target.value; paintRows(); });
    document.getElementById("f-status").addEventListener("change", function (e) { state.filters.status = e.target.value; paintRows(); });
    document.getElementById("f-sort").addEventListener("change", function (e) { state.filters.sort = e.target.value; paintRows(); });
    document.getElementById("list-body").addEventListener("click", function (e) {
      var del = e.target.closest("[data-del]");
      if (del) { removeEntry(del.dataset.del); return; }
      var edit = e.target.closest("[data-edit]");
      if (edit) { go("entry", { edit: edit.dataset.edit }); return; }
      var row = e.target.closest("[data-row]");
      if (row) go("entry", { edit: row.dataset.row });
    });
    paintRows();
  }

  function chipGroup(field, pairs, current) {
    var cur = Array.isArray(current) ? current : [current];
    return '<div class="chips" data-field="' + esc(field) + '" data-multi="0">' + pairs.map(function (p) {
      var on = cur.indexOf(p[0]) >= 0;
      return '<button type="button" class="chip' + (on ? " selected" : "") + '" data-value="' + esc(p[0]) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(p[1]) + "</button>";
    }).join("") + "</div>";
  }

  function datalist(id, values) {
    return '<datalist id="' + id + '">' + values.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join("") + "</datalist>";
  }

  function renderEntry(main) {
    var editing = state.editingId && state.entries.some(function (e) { return e.id === state.editingId; });
    var cats = BJD.CATEGORIES.slice();
    main.innerHTML =
      "<h2>" + (editing ? "修改这笔" : "记一笔") + "</h2>" +
      '<p class="lede">先写分类、企划和金额。档位、定金尾款、赠品和出物收在「更多」里。</p>' +
      '<div class="mode-switch">' +
      '<button type="button" data-mode="manual"' + (state.entryMode === "manual" ? ' class="selected"' : "") + ">手写</button>" +
      '<button type="button" data-mode="image"' + (state.entryMode === "image" ? ' class="selected"' : "") + ">从截图识别</button>" +
      "</div>" +
      '<section class="panel" id="pane-image"' + (state.entryMode === "image" ? "" : " hidden") + ">" +
      '<div class="drop" id="drop">' +
      '<p id="shot-empty">把订单页、众筹尾款或闲鱼截图拖进来，也可以粘贴。</p>' +
      '<img id="shot-preview" class="shot" alt="截图预览" hidden>' +
      '<div class="ocr-actions">' +
      '<label class="btn ghost">拍照或选图<input id="shot-file" type="file" accept="image/*" capture></label>' +
      '<button type="button" class="btn" id="btn-ocr">识别并填入</button>' +
      '<button type="button" class="btn ghost" id="btn-vision">用视觉模型再认一次</button>' +
      "</div>" +
      '<p class="ocr-status" id="ocr-status">默认识别在浏览器里完成，中文用 chi_sim。第一次会加载语言包。</p>' +
      '<details class="raw"><summary>识别出的原文</summary><pre id="ocr-raw">还没有识别。</pre></details>' +
      "</section>" +
      '<p class="banner" id="ocr-banner" hidden>这些是识别结果，请核对金额和日期后再入账。</p>' +
      '<form id="entry-form" autocomplete="off">' +
      '<div class="field" style="margin-bottom:10px"><span>分类</span>' + chipGroup("category", cats.map(function (c) { return [c, c]; }), "整娃") + "</div>" +
      '<div class="field" style="margin-bottom:10px"><span>入手</span>' + chipGroup("acquisition", [["", "未注明"]].concat(BJD.ACQUISITIONS.map(function (c) { return [c, c]; })), "") + "</div>" +
      '<div class="field" style="margin-bottom:12px"><span>状态</span>' + chipGroup("status", BJD.STATUSES.map(function (c) { return [c, c]; }), "已到") + "</div>" +
      '<div class="grid">' +
      field("企划名字", '<input id="f-project" placeholder="月光童话物语">', true) +
      field("具体名字", '<input id="f-name" placeholder="石榴蛇、胡桃匣子">', true) +
      field("出品", '<input id="f-maker" placeholder="不可食用人偶">') +
      field("金额", '<input id="f-amount" inputmode="decimal" placeholder="不含邮费">') +
      field("时间", '<input id="f-date" type="date">') +
      field("购买数量", '<input id="f-qty" inputmode="decimal" placeholder="例如 1">') +
      "</div>" +
      '<p class="hint">金额是商品总额。拆了定金和尾款时，总额写在这里，未付的尾款写在下面，并把状态改成待尾款。</p>' +
      '<p class="form-error" id="form-error"></p>' +
      details("more-spec", "档位、尺寸与材质", '<div class="grid">' +
        field("档位", '<input id="f-tier" list="list-tier" placeholder="端盒 / ALL IN">') +
        field("尺寸", '<input id="f-size" list="list-size" placeholder="十二分">') +
        field("肤色", '<input id="f-skin" list="list-skin" placeholder="普白肌">') +
        field("材质", '<input id="f-material" list="list-material" placeholder="树脂">') +
        "</div>" + datalist("list-tier", BJD.TIERS) + datalist("list-size", BJD.SIZES) + datalist("list-skin", BJD.SKINS) + datalist("list-material", BJD.MATERIALS)) +
      details("more-pay", "定金、尾款与杂费", '<div class="grid">' +
        field("定金", '<input id="f-deposit" inputmode="decimal">') +
        field("定金日期", '<input id="f-deposit-date" type="date">') +
        field("尾款", '<input id="f-balance" inputmode="decimal">') +
        field("尾款日期", '<input id="f-balance-date" type="date">') +
        field("邮费", '<input id="f-shipping" inputmode="decimal">') +
        field("代购费", '<input id="f-proxy" inputmode="decimal">') +
        "</div><p class=\"hint\">状态是「已付定」或「待尾款」时，尾款会计入待付，不计入已花费。</p>") +
      details("more-gifts", "赠品", '<div class="chips" id="gift-chips" data-multi="1">' +
        BJD.GIFT_PRESETS.map(function (g) {
          return '<button type="button" class="chip" data-value="' + esc(g) + '" aria-pressed="false">' + esc(g) + "</button>";
        }).join("") +
        '</div><div class="gift-add"><input id="gift-custom" placeholder="自定义赠品，例如脖卡"><button type="button" class="btn ghost" id="gift-add">添加</button></div>') +
      details("more-sale", "卖出与剩余", '<div class="grid">' +
        field("出物内容", '<input id="f-sale-content" placeholder="素体 / 娃衣一套">', true) +
        field("卖出数量", '<input id="f-sale-qty" inputmode="decimal">') +
        field("卖出金额", '<input id="f-sale-amount" inputmode="decimal">') +
        field("剩余内容", '<input id="f-remain" placeholder="还在手上的部分">', true) +
        field("备注", '<textarea id="f-note" rows="2"></textarea>', true) +
        "</div>") +
      '<div class="form-actions"><div class="calc" id="live-calc"></div><div class="form-buttons">' +
      '<button class="btn" type="submit" id="btn-save">' + (editing ? "保存修改" : "入账") + "</button>" +
      '<button class="btn ghost" type="button" id="btn-cancel">取消</button></div></div>' +
      "</form>";
    bindEntry();
    if (state.imageUrl) {
      var img = document.getElementById("shot-preview");
      img.src = state.imageUrl;
      img.hidden = false;
      document.getElementById("shot-empty").hidden = true;
    }
    if (editing) {
      var found = state.entries.find(function (e) { return e.id === state.editingId; });
      if (found) fillForm(found);
    }
    updateCalc();
  }

  function field(label, control, span) {
    return '<label class="field' + (span ? " span-2" : "") + '"><span>' + esc(label) + "</span>" + control + "</label>";
  }

  function details(id, title, inner) {
    return '<details class="more" id="' + id + '"><summary>' + esc(title) + '</summary><div class="inner">' + inner + "</div></details>";
  }

  function bindEntry() {
    document.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.entryMode = btn.dataset.mode;
        document.getElementById("pane-image").hidden = state.entryMode !== "image";
        document.querySelectorAll("[data-mode]").forEach(function (b) {
          b.classList.toggle("selected", b.dataset.mode === state.entryMode);
        });
      });
    });
    var drop = document.getElementById("drop");
    var file = document.getElementById("shot-file");
    file.addEventListener("change", function () { if (file.files[0]) setImage(file.files[0]); });
    ["dragover", "dragenter"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add("hot"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove("hot"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setImage(f);
    });
    document.getElementById("btn-ocr").addEventListener("click", runOcr);
    document.getElementById("btn-vision").addEventListener("click", runVision);
    document.getElementById("gift-add").addEventListener("click", addCustomGift);
    document.getElementById("gift-custom").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addCustomGift(); }
    });
    var form = document.getElementById("entry-form");
    form.addEventListener("input", updateCalc);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      saveFromForm();
    });
    document.getElementById("btn-cancel").addEventListener("click", function () { go("list"); });
  }

  function setImage(file) {
    if (!file || !/^image\//.test(file.type)) {
      setOcrStatus("请选图片文件");
      return;
    }
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.imageFile = file;
    state.imageUrl = URL.createObjectURL(file);
    var img = document.getElementById("shot-preview");
    if (!img) return;
    img.src = state.imageUrl;
    img.hidden = false;
    document.getElementById("shot-empty").hidden = true;
    setOcrStatus("已选图片，可以识别了");
  }

  function setOcrStatus(msg) {
    var el = document.getElementById("ocr-status");
    if (el) el.textContent = msg;
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function readNum(id) {
    var v = val(id);
    if (!v) return null;
    var n = Number(v.replace(/[,，¥￥\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function readChip(fieldName) {
    var el = document.querySelector('.chips[data-field="' + fieldName + '"] .chip.selected');
    return el ? el.dataset.value : "";
  }

  function setChip(fieldName, value) {
    var group = document.querySelector('.chips[data-field="' + fieldName + '"]');
    if (!group) return;
    var found = false;
    if (value && !group.querySelector('[data-value="' + CSS.escape(value) + '"]')) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.value = value;
      btn.textContent = value;
      group.appendChild(btn);
    }
    group.querySelectorAll(".chip").forEach(function (b) {
      var on = b.dataset.value === value;
      if (on) found = true;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    return found;
  }

  function readGifts() {
    return Array.prototype.map.call(document.querySelectorAll("#gift-chips .chip.selected"), function (b) { return b.dataset.value; });
  }

  function setGifts(gifts) {
    var host = document.getElementById("gift-chips");
    if (!host) return;
    gifts.forEach(function (g) {
      if (!host.querySelector('[data-value="' + CSS.escape(g) + '"]')) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.dataset.value = g;
        btn.textContent = g;
        host.appendChild(btn);
      }
    });
    host.querySelectorAll(".chip").forEach(function (b) {
      var on = gifts.indexOf(b.dataset.value) >= 0;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function readForm() {
    var prev = state.editingId ? state.entries.find(function (e) { return e.id === state.editingId; }) : null;
    return BJD.normalizeEntry({
      id: state.editingId || uid(),
      category: readChip("category") || "整娃",
      acquisition: readChip("acquisition") || "",
      status: readChip("status") || "已到",
      date: val("f-date"),
      project: val("f-project"),
      maker: val("f-maker"),
      itemName: val("f-name"),
      qty: readNum("f-qty"),
      amount: readNum("f-amount"),
      tier: val("f-tier"),
      size: val("f-size"),
      skin: val("f-skin"),
      material: val("f-material"),
      shipping: readNum("f-shipping"),
      proxyFee: readNum("f-proxy"),
      deposit: readNum("f-deposit"),
      depositPaidOn: val("f-deposit-date"),
      balanceDue: readNum("f-balance"),
      balanceDueOn: val("f-balance-date"),
      gifts: readGifts(),
      saleContent: val("f-sale-content"),
      saleQty: readNum("f-sale-qty"),
      saleAmount: readNum("f-sale-amount"),
      remainContent: val("f-remain"),
      note: val("f-note"),
      createdAt: prev ? prev.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
  }

  function openDetails(id) {
    var el = document.getElementById(id);
    if (el) el.open = true;
  }

  function fillForm(e) {
    setChip("category", e.category || "整娃");
    setChip("acquisition", e.acquisition || "");
    setChip("status", e.status || "已到");
    setVal("f-date", e.date);
    setVal("f-qty", e.qty);
    setVal("f-project", e.project);
    setVal("f-maker", e.maker);
    setVal("f-name", e.itemName);
    setVal("f-amount", e.amount);
    setVal("f-tier", e.tier);
    setVal("f-size", e.size);
    setVal("f-skin", e.skin);
    setVal("f-material", e.material);
    setVal("f-shipping", e.shipping);
    setVal("f-proxy", e.proxyFee);
    setVal("f-deposit", e.deposit);
    setVal("f-deposit-date", e.depositPaidOn);
    setVal("f-balance", e.balanceDue);
    setVal("f-balance-date", e.balanceDueOn);
    setVal("f-sale-content", e.saleContent);
    setVal("f-sale-qty", e.saleQty);
    setVal("f-sale-amount", e.saleAmount);
    setVal("f-remain", e.remainContent);
    setVal("f-note", e.note);
    setGifts(e.gifts || []);
    if (e.tier || e.size || e.skin || e.material) openDetails("more-spec");
    if (e.deposit != null || e.balanceDue != null || e.shipping != null || e.proxyFee != null) openDetails("more-pay");
    if (e.gifts && e.gifts.length) openDetails("more-gifts");
    if (e.saleAmount != null || e.saleContent || e.remainContent || e.note) openDetails("more-sale");
  }

  function applyPatch(patch) {
    if (!patch) return;
    ["date", "project", "maker", "tier", "size", "skin", "material", "saleContent", "remainContent", "note", "depositPaidOn", "balanceDueOn"].forEach(function (k) {
      if (patch[k]) setVal(fieldId(k), patch[k]);
    });
    ["itemName"].forEach(function (k) { if (patch[k]) setVal("f-name", patch[k]); });
    ["qty", "amount", "shipping", "proxyFee", "deposit", "balanceDue", "saleQty", "saleAmount"].forEach(function (k) {
      if (patch[k] != null && patch[k] !== "") setVal(fieldId(k), patch[k]);
    });
    if (patch.category) setChip("category", patch.category);
    if (patch.acquisition) setChip("acquisition", patch.acquisition);
    if (patch.status) setChip("status", patch.status);
    if (patch.gifts && patch.gifts.length) { setGifts(patch.gifts); openDetails("more-gifts"); }
    if (patch.tier || patch.size || patch.skin || patch.material) openDetails("more-spec");
    if (patch.deposit != null || patch.balanceDue != null || patch.shipping != null || patch.proxyFee != null) openDetails("more-pay");
    if (patch.saleAmount != null || patch.saleContent || patch.remainContent) openDetails("more-sale");
    var banner = document.getElementById("ocr-banner");
    if (banner) banner.hidden = false;
    updateCalc();
  }

  function fieldId(key) {
    return {
      date: "f-date", project: "f-project", maker: "f-maker", itemName: "f-name",
      qty: "f-qty", amount: "f-amount", tier: "f-tier", size: "f-size", skin: "f-skin",
      material: "f-material", shipping: "f-shipping", proxyFee: "f-proxy", deposit: "f-deposit",
      depositPaidOn: "f-deposit-date", balanceDue: "f-balance", balanceDueOn: "f-balance-date",
      saleContent: "f-sale-content", saleQty: "f-sale-qty", saleAmount: "f-sale-amount",
      remainContent: "f-remain", note: "f-note"
    }[key] || "";
  }

  function updateCalc() {
    var box = document.getElementById("live-calc");
    if (!box || !document.getElementById("entry-form")) return;
    var e = readForm();
    var text = "这笔支出 " + fmt(BJD.spent(e)) + " · 回血 " + fmt(BJD.recouped(e)) + " · 净额 " + fmt(BJD.net(e));
    if (BJD.pending(e)) text += " · 待付尾款 " + fmt(BJD.pending(e));
    box.textContent = text;
  }

  function addCustomGift() {
    var input = document.getElementById("gift-custom");
    var name = input.value.trim();
    if (!name) return;
    var gifts = readGifts();
    if (gifts.indexOf(name) < 0) gifts.push(name);
    setGifts(gifts);
    input.value = "";
  }

  async function saveFromForm() {
    var err = document.getElementById("form-error");
    var e = readForm();
    if (!e.project && !e.itemName && e.amount == null && e.saleAmount == null && e.shipping == null && e.deposit == null) {
      err.textContent = "先写上企划、名字或金额";
      return;
    }
    err.textContent = "";
    var existed = state.entries.some(function (x) { return x.id === e.id; });
    try {
      await persistOne(e);
    } catch (ex) {
      err.textContent = "没有写进本地账本：" + (ex.message || ex);
      return;
    }
    if (existed) state.entries = state.entries.map(function (x) { return x.id === e.id ? e : x; });
    else state.entries.push(e);
    toast(existed ? "已保存" : "已入账");
    go("list");
  }

  async function removeEntry(id) {
    if (!confirm("删除这条记录？只会影响这台浏览器里的账本。")) return;
    try { await persistDelete(id); }
    catch (ex) { toast("没有删掉：" + (ex.message || ex)); return; }
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
    toast("已删除");
    render();
  }

  var workerPromise = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("识别组件没有加载")); };
      document.head.appendChild(s);
    });
  }

  function progressLabel(m) {
    if (!m || !m.status) return "正在识别…";
    var map = {
      "loading tesseract core": "加载识别核心",
      "initializing tesseract": "初始化",
      "loading language traineddata": "加载中文语言包",
      "initializing api": "准备识别",
      "recognizing text": "识别文字"
    };
    var pct = m.progress != null ? " " + Math.round(m.progress * 100) + "%" : "";
    return (map[m.status] || "处理中") + pct;
  }

  var CDN_LANG = "https://tessdata.projectnaptha.com/4.0.0";

  async function langPathFor(base) {
    var names = ["chi_sim.traineddata.gz", "eng.traineddata.gz"];
    try {
      var checks = await Promise.all(names.map(function (name) {
        return fetch(new URL(name, base).href, { method: "HEAD" }).then(function (res) {
          return res.ok;
        }, function () { return false; });
      }));
      if (checks.every(Boolean)) return base;
    } catch (e) { /* use CDN */ }
    return CDN_LANG;
  }

  async function getWorker() {
    if (location.protocol === "file:") throw new Error("直接打开文件时不能识别截图。请用本地服务器打开这个页面。");
    await loadScript("vendor/tesseract/tesseract.min.js");
    if (!workerPromise) {
      var base = new URL("vendor/tesseract/", document.baseURI).href;
      var langPath = await langPathFor(base);
      if (langPath !== base) setOcrStatus("本地没有语言包，正在从网络加载中文识别数据…");
      workerPromise = window.Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: new URL("worker.min.js", base).href,
        corePath: base,
        langPath: langPath,
        workerBlobURL: false,
        logger: function (m) { setOcrStatus(progressLabel(m)); }
      }).catch(function (err) {
        workerPromise = null;
        throw err;
      });
    }
    return workerPromise;
  }

  async function runOcr() {
    if (!state.imageFile) { setOcrStatus("先选一张截图"); return; }
    var btn = document.getElementById("btn-ocr");
    btn.disabled = true;
    try {
      var worker = await getWorker();
      setOcrStatus("正在识别文字…");
      var result = await worker.recognize(state.imageFile);
      var text = (result && result.data && result.data.text) || "";
      document.getElementById("ocr-raw").textContent = text.trim() || "（没有识别出文字）";
      var parsed = BJD.parseOcrText(text);
      applyPatch(parsed.patch);
      setOcrStatus("识别完成，请核对后再入账。" + (parsed.warnings.length ? " " + parsed.warnings.join("；") : ""));
    } catch (err) {
      setOcrStatus(err && err.message ? err.message : "识别失败");
    } finally {
      btn.disabled = false;
    }
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("读不到这张图片")); };
      reader.readAsDataURL(file);
    });
  }

  function extractJson(text) {
    var raw = String(text || "").trim();
    var fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1];
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("视觉模型没有返回 JSON");
    return JSON.parse(raw.slice(start, end + 1));
  }

  function visionConfig() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem("xiaji.vision.v1") || "{}"); } catch (e) { saved = {}; }
    return {
      baseUrl: saved.baseUrl || "https://api.openai.com/v1",
      model: saved.model || "gpt-4o-mini",
      remember: !!saved.remember,
      apiKey: state.visionKey || ""
    };
  }

  function saveVision(cfg) {
    state.visionKey = cfg.apiKey || "";
    localStorage.setItem("xiaji.vision.v1", JSON.stringify({
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      remember: !!cfg.remember,
      apiKey: cfg.remember ? cfg.apiKey : ""
    }));
  }

  async function runVision() {
    if (!state.imageFile) { setOcrStatus("先选一张截图"); return; }
    var cfg = visionConfig();
    if (!cfg.apiKey) { setOcrStatus("要先在「数据」页填写视觉模型的接口和密钥"); return; }
    var btn = document.getElementById("btn-vision");
    btn.disabled = true;
    setOcrStatus("正在请视觉模型看这张图…");
    try {
      var dataUrl = await fileToDataUrl(state.imageFile);
      var base = cfg.baseUrl.replace(/\/$/, "");
      var res = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "text", text: BJD.VISION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } }
          ] }]
        })
      });
      var body = await res.text();
      if (!res.ok) {
        var brief = body.replace(cfg.apiKey, "***").slice(0, 180);
        throw new Error("接口返回 " + res.status + (brief ? "：" + brief : "") + "。请确认地址、模型和跨域。");
      }
      var data = JSON.parse(body);
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      applyPatch(BJD.applyVisionObject(extractJson(content)));
      setOcrStatus("视觉模型已填入，请再核对一次。");
    } catch (err) {
      setOcrStatus((err && err.message ? err.message : "视觉模型没有返回").replace(cfg.apiKey, "***"));
    } finally {
      btn.disabled = false;
    }
  }

  function renderRules(main) {
    var rules = activeRules();
    main.innerHTML =
      "<h2>规则</h2>" +
      '<p class="lede">账本上的每个合计都由这些规则算出来。可以停用、修改或另加一条。自定义规则保存在这台浏览器里。</p>' +
      '<div class="form-buttons" style="margin-bottom:12px">' +
      '<button type="button" class="btn" id="rule-add">加一条</button>' +
      '<button type="button" class="btn ghost" id="rule-export">导出 JSON</button>' +
      '<label class="btn ghost">导入 JSON<input id="rule-import" type="file" accept="application/json,.json" hidden></label>' +
      '<button type="button" class="btn danger" id="rule-reset">恢复内置</button>' +
      "</div>" +
      '<p class="form-error" id="rule-error"></p>' +
      '<div id="rule-list">' + rules.map(ruleCard).join("") + "</div>" +
      '<details class="fold" id="rule-editor"' + (state.ruleDraft ? " open" : "") + '><summary>编辑规则</summary><div class="fold-body">' +
      '<textarea id="rule-json" spellcheck="false">' + esc(state.ruleDraft || "") + "</textarea>" +
      '<div class="form-buttons" style="margin-top:8px"><button type="button" class="btn" id="rule-save">保存这条</button></div></div></details>';
    document.getElementById("rule-list").addEventListener("click", onRuleClick);
    document.getElementById("rule-add").addEventListener("click", function () {
      state.ruleDraft = JSON.stringify({
        id: "custom-" + Date.now().toString(36),
        description: "新规则",
        enabled: true,
        target: "spent",
        condition: { op: "always" },
        formula: { op: "ref", name: "spent" }
      }, null, 2);
      render();
    });
    document.getElementById("rule-export").addEventListener("click", function () {
      var doc = BJDRules.exportDoc(activeRules());
      downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }), "匣记-规则.json");
    });
    document.getElementById("rule-import").addEventListener("change", onRuleImport);
    document.getElementById("rule-reset").addEventListener("click", async function () {
      if (!confirm("恢复内置规则？你改过的规则会从这台浏览器里清掉。")) return;
      await saveRules(BJDRules.defaultRules());
      state.ruleDraft = "";
      toast("已恢复内置规则");
      render();
    });
    var save = document.getElementById("rule-save");
    if (save) save.addEventListener("click", saveRuleDraft);
  }

  function ruleCard(rule) {
    return '<article class="rule' + (rule.enabled ? "" : " off") + '">' +
      '<div class="rule-top"><div><strong>' + esc(rule.id) + "</strong><div class=\"sub\">" + esc(rule.description) + "</div></div>" +
      '<button type="button" class="btn ghost small" data-rule-toggle="' + esc(rule.id) + '">' + (rule.enabled ? "停用" : "启用") + "</button></div>" +
      '<p class="sub">写入 ' + esc(rule.target) + (rule.groupBy ? " · 按 " + esc(rule.groupBy) : "") + "</p>" +
      '<div class="form-buttons" style="margin-top:8px"><button type="button" class="btn ghost small" data-rule-edit="' + esc(rule.id) + '">编辑</button>' +
      (rule.builtin ? "" : '<button type="button" class="btn danger small" data-rule-del="' + esc(rule.id) + '">删除</button>') +
      "</div></article>";
  }

  function onRuleClick(e) {
    var toggle = e.target.closest("[data-rule-toggle]");
    var edit = e.target.closest("[data-rule-edit]");
    var del = e.target.closest("[data-rule-del]");
    var rules = activeRules().map(function (rule) { return JSON.parse(JSON.stringify(rule)); });
    if (toggle) {
      rules.forEach(function (rule) { if (rule.id === toggle.dataset.ruleToggle) rule.enabled = !rule.enabled; });
      saveRules(rules).then(function () { render(); });
      return;
    }
    if (edit) {
      var found = rules.filter(function (rule) { return rule.id === edit.dataset.ruleEdit; })[0];
      state.ruleDraft = JSON.stringify(found, null, 2);
      render();
      return;
    }
    if (del) {
      saveRules(rules.filter(function (rule) { return rule.id !== del.dataset.ruleDel; })).then(function () { toast("已删除"); render(); });
    }
  }

  async function saveRuleDraft() {
    var err = document.getElementById("rule-error");
    try {
      var parsed = JSON.parse(document.getElementById("rule-json").value);
      BJDRules.validate(parsed);
      var rules = activeRules().filter(function (rule) { return rule.id !== parsed.id; });
      var known = BJDRules.defaultRules().some(function (rule) { return rule.id === parsed.id; });
      parsed.builtin = known;
      rules.push(BJDRules.normalizeRule(parsed));
      if (known) rules = BJDRules.merge(rules);
      await saveRules(rules);
      state.ruleDraft = "";
      toast("规则已保存");
      render();
    } catch (ex) {
      err.textContent = ex.message || "这条规则没保存";
    }
  }

  async function onRuleImport(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      var rules = BJDRules.importDoc(JSON.parse(await file.text()));
      await saveRules(rules);
      toast("已导入 " + rules.length + " 条规则");
      render();
    } catch (err) {
      document.getElementById("rule-error").textContent = err.message || "没有导入";
    }
  }

  function renderPivot(main) {
    var p = state.pivot;
    function select(id, pairs, current) {
      return '<select id="' + id + '">' + pairs.map(function (pair) {
        return '<option value="' + esc(pair[0]) + '"' + (pair[0] === current ? " selected" : "") + ">" + esc(pair[1]) + "</option>";
      }).join("") + "</select>";
    }
    main.innerHTML =
      "<h2>透视</h2>" +
      '<p class="lede">行、列和汇总方式可以换。导出的就是当前这张表，数字按数值写入，并附上这些账的明细。</p>' +
      '<div class="form-buttons pivot-export">' +
      '<button type="button" class="btn" id="btn-pivot-xlsx">导出 Excel</button>' +
      '<button type="button" class="btn ghost" id="btn-pivot-all">导出全部维度</button>' +
      "</div>" +
      fold("行、列和值", '<div class="pivot-controls">' +
      "<label>行" + select("p-row", BJD.DIMS, p.row) + "</label>" +
      "<label>列" + select("p-col", BJD.DIMS, p.col) + "</label>" +
      "<label>值" + select("p-metric", BJD.METRICS, p.metric) + "</label>" +
      "</div>") +
      '<p class="scroll-hint">左右滑动查看整张表</p>' +
      '<div class="table-wrap"><table class="pivot-table" id="pivot-table"></table></div>';
    ["p-row", "p-col", "p-metric"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        state.pivot.row = document.getElementById("p-row").value;
        state.pivot.col = document.getElementById("p-col").value;
        state.pivot.metric = document.getElementById("p-metric").value;
        paintPivot();
      });
    });
    document.getElementById("btn-pivot-xlsx").addEventListener("click", function () { exportPivot(false); });
    document.getElementById("btn-pivot-all").addEventListener("click", function () { exportPivot(true); });
    paintPivot();
  }

  function exportPivot(allDims) {
    try {
      var bytes = BJD.buildPivotWorkbook(state.entries, {
        row: state.pivot.row,
        col: state.pivot.col,
        metric: state.pivot.metric,
        allDims: !!allDims
      });
      var name = BJD.pivotFileName(state.pivot.row, new Date(), !!allDims);
      var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      Promise.resolve(downloadBlob(blob, name)).then(function () {
        toast(allDims ? "已导出全部维度" : "已导出透视");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        toast(err && err.message ? err.message : "没有导出");
      });
    } catch (err) {
      toast(err && err.message ? err.message : "没有导出");
    }
  }

  function paintPivot() {
    var table = document.getElementById("pivot-table");
    if (!table) return;
    if (!state.entries.length) {
      table.innerHTML = "<tbody><tr><td>账本是空的。</td></tr></tbody>";
      return;
    }
    var p = BJD.pivot(state.entries, state.pivot.row, state.pivot.col, state.pivot.metric);
    if (!p.rows.length) {
      table.innerHTML = "<tbody><tr><td>这个交叉是空的。</td></tr></tbody>";
      return;
    }
    var head = "<tr><th></th>" + p.cols.map(function (c) { return "<th class=\"num\">" + esc(c) + "</th>"; }).join("") + '<th class="num">合计</th></tr>';
    var colTotals = p.cols.map(function () { return 0; });
    var grand = 0;
    var body = p.rows.map(function (r) {
      var rowTotal = 0;
      var cells = p.cols.map(function (c, i) {
        var n = BJD.cellAt(p, r, c);
        rowTotal += n;
        colTotals[i] += n;
        return '<td class="num">' + fmtCell(state.pivot.metric, n) + "</td>";
      }).join("");
      grand += rowTotal;
      return "<tr><th>" + esc(r) + "</th>" + cells + '<td class="num">' + fmtCell(state.pivot.metric, rowTotal) + "</td></tr>";
    }).join("");
    var foot = '<tr class="total"><th>合计</th>' + colTotals.map(function (n) {
      return '<td class="num">' + fmtCell(state.pivot.metric, n) + "</td>";
    }).join("") + '<td class="num">' + fmtCell(state.pivot.metric, grand) + "</td></tr>";
    table.innerHTML = "<thead>" + head + "</thead><tbody>" + body + foot + "</tbody>";
  }

  function renderData(main) {
    var summary = BJD.summarize(state.entries);
    var cfg = visionConfig();
    main.innerHTML =
      "<h2>数据</h2>" +
      '<p class="lede">账目记在这台浏览器的 IndexedDB 里。导出的表格和 JSON 只有账，没有视觉模型密钥。</p>' +
      '<div class="split">' +
      '<section class="panel stack"><h3>导入</h3>' +
      "<p>可以导入原来的账表（含「企划名字」「赠品小物」），或匣记导出的表格和 JSON。示例文件是 <code>samples/ledger.xlsx</code>，不会自动载入。</p>" +
      '<label class="check"><input type="radio" name="import-mode" value="append" checked> 追加到现有账本</label>' +
      '<label class="check"><input type="radio" name="import-mode" value="replace"> 用文件替换全部</label>' +
      '<label class="btn">选择文件<input id="import-file" type="file" accept=".xlsx,.xls,.json,application/json" hidden></label>' +
      '<p class="hint" id="import-status">当前 ' + summary.count + " 笔，支出 " + fmt(summary.spent) + "，回血 " + fmt(summary.recouped) + "，净额 " + fmt(summary.net) + "。</p></section>" +
      '<section class="panel stack"><h3>导出</h3>' +
      "<p>Excel 用中文表头，方便再导回来。JSON 给自己留档。</p>" +
      '<button type="button" class="btn" id="btn-xlsx">导出 Excel</button>' +
      '<button type="button" class="btn ghost" id="btn-json">导出 JSON</button>' +
      "</section></div>" +
      '<section class="panel stack" style="margin-top:12px"><h3>示例与清空</h3>' +
      "<p>示例账在 <code>samples/ledger.xlsx</code>。只有点「恢复示例账」才会载入，并替换现在的记录。</p>" +
      '<div class="form-buttons"><button type="button" class="btn ghost" id="btn-restore">恢复示例账</button><button type="button" class="btn danger" id="btn-clear">清空账本</button></div></section>' +
      '<section class="panel stack" style="margin-top:12px"><h3>视觉模型（可选）</h3>' +
      "<p>截图默认用浏览器里的 Tesseract 中文识别。如果另外有兼容 OpenAI 的视觉接口，可以填在这里，识别会更稳。密钥只留在这台浏览器，勾了「记住」也只写在本地设置里，不会进导出文件。</p>" +
      '<label class="field"><span>接口地址</span><input id="v-base" value="' + esc(cfg.baseUrl) + '" placeholder="https://api.openai.com/v1"></label>' +
      '<label class="field"><span>模型</span><input id="v-model" value="' + esc(cfg.model) + '" placeholder="gpt-4o-mini"></label>' +
      '<label class="field"><span>密钥</span><input id="v-key" type="password" autocomplete="off" value="' + esc(cfg.apiKey) + '"></label>' +
      '<label class="check"><input id="v-remember" type="checkbox"' + (cfg.remember ? " checked" : "") + "> 在这台浏览器记住密钥</label>" +
      '<button type="button" class="btn" id="btn-vision-save">保存接口设置</button>' +
      '<p class="hint">调用发生在你的浏览器和你填的地址之间。接口需要允许网页跨域。</p></section>';
    document.getElementById("import-file").addEventListener("change", onImportFile);
    document.getElementById("btn-xlsx").addEventListener("click", exportXlsx);
    document.getElementById("btn-json").addEventListener("click", exportJson);
    document.getElementById("btn-restore").addEventListener("click", restoreDemo);
    document.getElementById("btn-clear").addEventListener("click", clearAll);
    document.getElementById("btn-vision-save").addEventListener("click", function () {
      saveVision({
        baseUrl: val("v-base") || "https://api.openai.com/v1",
        model: val("v-model") || "gpt-4o-mini",
        apiKey: val("v-key"),
        remember: document.getElementById("v-remember").checked
      });
      toast("接口设置已留在这台浏览器");
    });
  }

  function fileStamp(ext) {
    var d = new Date();
    var day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return "匣记-账本-" + day + "." + ext;
  }

  function shareFile(blob, name) {
    var file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    if (!navigator.share) return Promise.reject(new Error("这台浏览器不能下载文件"));
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      return Promise.reject(new Error("这台浏览器不能分享这个文件"));
    }
    return navigator.share({ files: [file], title: name });
  }

  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    if (typeof a.download === "undefined") return shareFile(blob, name);
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
    return Promise.resolve();
  }

  function exportXlsx() {
    var matrix = BJD.entriesToMatrix(state.entries);
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(matrix);
    ws["!cols"] = matrix[0].map(function (h) { return { wch: Math.max(12, String(h).length * 2) }; });
    XLSX.utils.book_append_sheet(wb, ws, "匣记");
    var out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileStamp("xlsx"));
  }

  function exportJson() {
    var env = BJD.exportEnvelope(state.entries);
    downloadBlob(new Blob([JSON.stringify(env, null, 2)], { type: "application/json" }), fileStamp("json"));
  }

  async function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || "append";
    var status = document.getElementById("import-status");
    try {
      var entries;
      if (/\.json$/i.test(file.name)) entries = BJD.importEnvelope(JSON.parse(await file.text()));
      else entries = (await BJD.parseArrayBuffer(await file.arrayBuffer())).entries;
      if (!entries.length) throw new Error("文件里没有账目");
      entries = entries.map(function (item) {
        var n = BJD.normalizeEntry(item);
        if (mode === "append" || !n.id) n.id = uid();
        return n;
      });
      if (mode === "replace") {
        await persistAll(entries);
        state.entries = entries;
      } else {
        if (state.db) await idbPutAll(state.db, entries);
        else saveLocal(state.entries.concat(entries));
        state.entries = state.entries.concat(entries);
      }
      localStorage.setItem("xiaji.seeded", "1");
      var sum = BJD.summarize(entries);
      status.textContent = "已导入 " + entries.length + " 笔。这批支出 " + fmt(sum.spent) + "，回血 " + fmt(sum.recouped) + "，净额 " + fmt(sum.net) + "。账本现在共 " + state.entries.length + " 笔。";
      toast("导入完成");
    } catch (err) {
      status.textContent = err && err.message ? err.message : "这个文件没有导入";
    }
  }

  async function restoreDemo() {
    if (!confirm("用示例账替换当前账本？现在这些记录会从这台浏览器里清掉。")) return;
    try {
      var res = await fetch("./samples/ledger.xlsx");
      if (!res.ok) throw new Error("示例账没有加载");
      var parsed = await BJD.parseArrayBuffer(await res.arrayBuffer());
      var seed = (parsed.entries || []).map(BJD.normalizeEntry);
      if (!seed.length) throw new Error("示例账是空的");
      await persistAll(seed);
      state.entries = seed;
      localStorage.setItem("xiaji.seeded", "1");
      toast("已恢复示例账");
      go("dash");
    } catch (err) {
      toast(err && err.message ? err.message : "没有恢复示例账");
    }
  }

  async function clearAll() {
    if (!confirm("清空这台浏览器里的全部账目？已经导出的文件不会变。")) return;
    await persistAll([]);
    state.entries = [];
    localStorage.setItem("xiaji.seeded", "1");
    toast("已清空");
    render();
  }

  document.body.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav]");
    if (nav && nav.tagName === "A") {
      e.preventDefault();
      go(nav.dataset.nav);
      return;
    }
    var chip = e.target.closest(".chip");
    if (chip && chip.closest(".chips")) {
      var group = chip.closest(".chips");
      if (group.dataset.multi === "1") chip.classList.toggle("selected");
      else {
        group.querySelectorAll(".chip").forEach(function (b) { b.classList.remove("selected"); });
        chip.classList.add("selected");
      }
      group.querySelectorAll(".chip").forEach(function (b) {
        b.setAttribute("aria-pressed", b.classList.contains("selected") ? "true" : "false");
      });
      updateCalc();
    }
  });

  document.addEventListener("paste", function (e) {
    if (state.view !== "entry" || state.entryMode !== "image") return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image/") === 0) {
        var file = items[i].getAsFile();
        if (file) { setImage(file); e.preventDefault(); }
        break;
      }
    }
  });

  window.addEventListener("resize", function () {
    (state.charts || []).forEach(function (chart) {
      try { chart.resize(); } catch (e) { /* chart already destroyed */ }
    });
    if (window.matchMedia("(min-width: 431px)").matches) {
      document.querySelectorAll("details.fold").forEach(function (el) { el.open = true; });
    }
  });

  window.addEventListener("hashchange", function () {
    state.view = viewFromHash();
    render();
  });

  async function init() {
    try {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem("xiaji.vision.v1") || "{}"); } catch (e) { saved = {}; }
      state.visionKey = saved.apiKey || "";
      state.entries = await loadEntries();
      state.rules = await loadRules();
    } catch (err) {
      state.error = err && err.message ? err.message : "打不开本地账本";
    }
    state.ready = true;
    state.view = viewFromHash();
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* 安装到主屏幕失败时，账本照常使用 */ });
    }
  }

  init();
})();
