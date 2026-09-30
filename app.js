(function () {
  "use strict";

  // Mismo proyecto Supabase que usan los 6 apps de Mirage - la publishable
  // key ya esta expuesta en esos bundles (es publica por diseno, RLS es lo
  // que de verdad protege los datos). Aca solo leemos vistas de solo lectura
  // que ya excluyen nombre/email donde corresponde:
  //  - ranking_by_experience / ranking_combined: nombre+score, igual que ya
  //    se muestra en las pantallas de Top 5 de las tablets/totems (publico).
  //  - registrations_counts / participations_anonymous_counts /
  //    product_view_counts: solo conteos agregados, nunca nombre/email.
  var SUPABASE_URL = "https://xcizlmidlesiqorsachh.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_0-Nv8ruEdXMwz_Eh_qrTJg_OrQxR9Jj";
  var COUNTRIES = ["CO", "MX"];
  var EXPERIENCES = ["catalogo", "memory_match"];
  var TZ_BY_COUNTRY = { CO: "America/Bogota", MX: "America/Mexico_City" };
  var COUNTRY_META = {
    CO: { flag: "🇨🇴", name: "Colombia" },
    MX: { flag: "🇲🇽", name: "México" },
  };
  var EXP_LABEL = { catalogo: "Catálogo", memory_match: "Memory Match" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fetchSupabase(path) {
    return fetch(SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, Range: "0-9999" },
    }).then(function (res) {
      if (!res.ok) throw new Error("supabase fetch failed: " + path + " -> " + res.status);
      return res.json();
    });
  }

  // ---------- Tabs ----------
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll(".tab-btn"));
  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) { b.setAttribute("aria-selected", String(b === btn)); });
      ["resumen", "tablas", "graficas"].forEach(function (name) {
        document.getElementById("panel-" + name).hidden = name !== btn.dataset.tab;
      });
    });
  });

  // ---------- Resumen ----------
  function tile(value, label, extraClass) {
    return '<div class="tile ' + (extraClass || "") + (value === 0 && extraClass === "anon" ? " zero" : "") + '">' +
      '<div class="value num">' + esc(value) + '</div>' +
      '<div class="label">' + esc(label) + '</div>' +
      '</div>';
  }
  function rankingRows(rows) {
    if (!rows || rows.length === 0) return '<div class="empty-row">Aún no hay resultados.</div>';
    return rows.map(function (r, i) {
      return '<div class="rank-row' + (i === 0 ? " top" : "") + '">' +
        '<div class="rank-pos">' + (i + 1) + '</div>' +
        '<div class="rank-name">' + esc(r.name) + '</div>' +
        '<div class="rank-score num">' + Math.round(r.score) + ' pt</div>' +
        '</div>';
    }).join("");
  }
  function countryCard(code, data, registrations, rankingTitle) {
    var meta = COUNTRY_META[code];
    var t = data.totals || {};
    return '<div class="country">' +
      '<div class="country-head"><span class="flag">' + meta.flag + '</span>' +
      '<div><h2>' + meta.name + '</h2><div class="sub">' + code + '</div></div></div>' +
      '<div class="tiles">' +
        tile(registrations || 0, "Registros (código)") +
        tile(t.catalogo || 0, "Jugaron Catálogo") +
        tile(t.memoryMatch || 0, "Jugaron Memory Match") +
        tile(t.anonymous || 0, "Sin registro", "anon") +
      '</div>' +
      '<div><div class="section-title"><h3>' + rankingTitle + '</h3></div>' +
      '<div class="ranking">' + rankingRows(data.top5) + '</div></div>' +
    '</div>';
  }

  // ---------- Tablas ----------
  function dataTable(rows) {
    if (!rows || rows.length === 0) return '<div class="products-empty">Sin participaciones todavía.</div>';
    var body = rows.map(function (r) {
      var dt = new Date(r.submittedAt);
      var when = isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 16).replace("T", " ");
      return '<tr><td class="name">' + esc(r.name) + '</td><td class="score num">' + Math.round(r.score) + '</td><td class="mono">' + when + '</td></tr>';
    }).join("");
    return '<div class="table-wrap"><table class="data"><thead><tr><th>Nombre</th><th>Puntaje</th><th>Enviado (UTC)</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function renderTables(snap) {
    var root = document.getElementById("tables-root");
    var html = "";
    COUNTRIES.forEach(function (code) {
      var meta = COUNTRY_META[code];
      EXPERIENCES.forEach(function (exp) {
        var rows = (snap.tables && snap.tables[code + "_" + exp]) || [];
        html += '<div class="section-title"><h3>' + meta.flag + ' ' + meta.name + ' · ' + EXP_LABEL[exp] + '</h3><div class="day">' + rows.length + ' participaciones</div></div>' + dataTable(rows);
      });
    });
    root.innerHTML = html;
  }

  // ---------- Gráficas (SVG, sin librerias) ----------
  function buildBarChart(hours, seriesList, opts) {
    var width = Math.max(640, hours.length * 34);
    var height = 200;
    var padL = 32, padB = 34, padT = 10, padR = 8;
    var innerW = width - padL - padR;
    var innerH = height - padT - padB;
    var groupW = innerW / hours.length;
    var barW = Math.max(3, (groupW - 6) / seriesList.length);
    var maxVal = 1;
    seriesList.forEach(function (s) { s.data.forEach(function (v) { if (v > maxVal) maxVal = v; }); });

    var bars = "";
    hours.forEach(function (h, hi) {
      var gx = padL + hi * groupW;
      seriesList.forEach(function (s, si) {
        var v = s.data[hi] || 0;
        var barH = innerH * (v / maxVal);
        var x = gx + si * barW + 2;
        var y = padT + innerH - barH;
        if (v > 0) {
          bars += '<rect class="bar-tip" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (barW - 2).toFixed(1) + '" height="' + Math.max(1, barH).toFixed(1) + '" rx="2" fill="' + s.color + '"><title>' + esc(opts.hourLabel(h)) + " · " + esc(s.name) + ": " + v + '</title></rect>';
        }
      });
    });

    var everyN = Math.ceil(hours.length / 10);
    var labels = "";
    hours.forEach(function (h, hi) {
      if (hi % everyN !== 0) return;
      var gx = padL + hi * groupW + groupW / 2;
      labels += '<text x="' + gx.toFixed(1) + '" y="' + (height - padB + 16).toFixed(1) + '" text-anchor="middle">' + esc(opts.hourLabel(h)) + '</text>';
    });

    var gridLines = "";
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var yy = padT + innerH - (innerH * i) / ticks;
      var val = Math.round((maxVal * i) / ticks);
      gridLines += '<line class="axis-line" x1="' + padL + '" x2="' + (width - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
      gridLines += '<text x="4" y="' + (yy + 3).toFixed(1) + '">' + val + '</text>';
    }

    return '<svg class="chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(opts.ariaLabel) + '">' + gridLines + bars + labels + '</svg>';
  }

  function hourLabel(h) {
    var parts = h.split(" ");
    var date = parts[0].split("-");
    return date[2] + "/" + date[1] + " " + parts[1].slice(0, 2) + "h";
  }

  function renderCharts(stats, products) {
    var hours = stats.hours || [];
    var series = stats.series || {};
    var zeros = hours.map(function () { return 0; });
    function sum(a, b) { return hours.map(function (_, i) { return (a[i] || 0) + (b[i] || 0); }); }

    var coTotal = sum(series.CO_catalogo || zeros, series.CO_memory_match || zeros);
    var mxTotal = sum(series.MX_catalogo || zeros, series.MX_memory_match || zeros);
    document.getElementById("chart-countries").innerHTML = hours.length ? buildBarChart(hours, [
      { data: coTotal, color: "var(--series-co)", name: "Colombia" },
      { data: mxTotal, color: "var(--series-mx)", name: "México" },
    ], { hourLabel: hourLabel, ariaLabel: "Participaciones por hora, Colombia vs México" }) : '<div class="products-empty">Sin datos suficientes todavía.</div>';

    var catalogoTotal = sum(series.CO_catalogo || zeros, series.MX_catalogo || zeros);
    var memoryTotal = sum(series.CO_memory_match || zeros, series.MX_memory_match || zeros);
    document.getElementById("chart-experiences").innerHTML = hours.length ? buildBarChart(hours, [
      { data: catalogoTotal, color: "var(--accent-ice)", name: "Catálogo" },
      { data: memoryTotal, color: "var(--accent)", name: "Memory Match" },
    ], { hourLabel: hourLabel, ariaLabel: "Participaciones por hora, Catálogo vs Memory Match" }) : '<div class="products-empty">Sin datos suficientes todavía.</div>';

    var hasAny = (products.CO && products.CO.length) || (products.MX && products.MX.length);
    if (!hasAny) {
      document.getElementById("products-root").innerHTML = '<div class="products-empty">Todavía no hay datos de productos vistos.</div>';
    } else {
      var html = "";
      COUNTRIES.forEach(function (code) {
        var list = products[code] || [];
        if (!list.length) return;
        var maxCount = list[0].count;
        html += '<div class="section-title"><h3>' + COUNTRY_META[code].flag + ' ' + COUNTRY_META[code].name + '</h3></div>';
        html += list.map(function (p) {
          var pct = Math.round((p.count / maxCount) * 100);
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<div style="width:120px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.id) + '</div>' +
            '<div style="flex:1;background:var(--surface-2);border-radius:6px;overflow:hidden;height:16px;">' +
              '<div style="width:' + pct + '%;background:var(--accent-ice);height:100%;"></div>' +
            '</div>' +
            '<div class="num" style="width:28px;text-align:right;font-size:13px;">' + p.count + '</div>' +
          '</div>';
        }).join("");
      });
      document.getElementById("products-root").innerHTML = html;
    }
  }

  // ---------- Ranking combinado, calculado en el cliente a partir de
  // ranking_by_experience (mismo score que ya usan las pantallas de premio:
  // promedio catalogo+memory_match, 0 si no jugo esa experiencia) ----------
  // Ranking COMPLETO (no solo Top 5) - si participaron 100 personas ese dia,
  // devuelve las 100, ordenadas de mayor a menor. El dia sigue filtrando
  // (es el ranking real de ESE dia, el que decide el premio).
  function combinedRanking(rows) {
    var byParticipant = {};
    rows.forEach(function (r) {
      var key = r.participant_id;
      if (!byParticipant[key]) byParticipant[key] = { name: r.participant_name, catalogo: 0, memory_match: 0 };
      byParticipant[key][r.experience] = Math.max(byParticipant[key][r.experience], Number(r.score));
      if (r.participant_name) byParticipant[key].name = r.participant_name;
    });
    return Object.keys(byParticipant).map(function (k) {
      var p = byParticipant[k];
      return { name: p.name || "Anónimo", score: (p.catalogo + p.memory_match) / 2 };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  // ---------- Filtro de dia ----------
  var daySelect = document.getElementById("day-select");
  var latestStats = null;

  function dayOptionLabel(day, index, total) {
    if (index === total - 1) return "Hoy · " + day;
    if (index === total - 2) return "Ayer · " + day;
    return day;
  }
  function populateDaySelect(days) {
    var current = daySelect.value;
    var html = days.map(function (d, i) {
      return '<option value="' + esc(d) + '">' + esc(dayOptionLabel(d, i, days.length)) + '</option>';
    }).join("") + '<option value="__all__">Todos los días</option>';
    daySelect.innerHTML = html;
    if (current && Array.prototype.some.call(daySelect.options, function (o) { return o.value === current; })) {
      daySelect.value = current;
    } else if (days.length) {
      daySelect.value = days[days.length - 1];
    }
  }
  function snapshotFor(stats, dayValue) {
    if (dayValue === "__all__") return stats.all;
    return (stats.byDay && stats.byDay[dayValue]) || { countries: {}, tables: {}, products: {} };
  }

  function renderForDay() {
    if (!latestStats) return;
    var dayValue = daySelect.value || "__all__";
    var snap = snapshotFor(latestStats, dayValue);
    // Ranking COMPLETO del dia seleccionado (si jugaron 100 personas ese dia,
    // se muestran las 100, no solo 5) - sigue siendo el ranking real de ESE
    // dia, el que decide el premio.
    var rankingTitle = dayValue === "__all__" ? "Ranking · Mejor promedio de toda la semana" : "Ranking general de ese día";

    document.getElementById("countries").innerHTML = COUNTRIES.map(function (code) {
      var data = (snap.countries && snap.countries[code]) || { totals: {}, top5: [] };
      return countryCard(code, data, latestStats.registrations && latestStats.registrations[code], rankingTitle);
    }).join("");
    renderTables(snap);
    // Los graficos de actividad por hora siempre muestran el rango completo
    // (para ver picos entre dias) - no se filtran por el selector de dia.
    renderCharts(latestStats, latestStats.products);
  }

  function render(stats) {
    latestStats = stats;
    document.getElementById("updatedAt").textContent = stats.updatedAtLabel || "—";
    populateDaySelect(stats.days || []);
    renderForDay();
  }

  daySelect.addEventListener("change", renderForDay);

  // ---------- Carga en vivo desde Supabase ----------
  function loadAll() {
    return Promise.all([
      fetchSupabase("ranking_by_experience?select=country,experience,participant_id,participant_name,score,submitted_at,event_day&order=submitted_at.asc"),
      fetchSupabase("registrations_counts"),
      fetchSupabase("participations_anonymous_counts"),
      fetchSupabase("product_view_counts?order=total.desc"),
    ]).then(function (results) {
      var rankingRows = results[0];
      var regCounts = results[1];
      var anonCounts = results[2];
      var productRows = results[3];

      var registrations = {};
      regCounts.forEach(function (r) { registrations[r.country] = r.total; });

      var anonByCountryDay = {};
      var anonByCountry = {};
      anonCounts.forEach(function (r) {
        anonByCountryDay[r.country + "|" + r.event_day] = (anonByCountryDay[r.country + "|" + r.event_day] || 0) + r.total;
        anonByCountry[r.country] = (anonByCountry[r.country] || 0) + r.total;
      });

      var products = {};
      COUNTRIES.forEach(function (c) { products[c] = []; });
      productRows.forEach(function (r) {
        if (!products[r.country]) products[r.country] = [];
        products[r.country].push({ id: r.product_id, count: r.total });
      });

      var days = [];
      var seenDay = {};
      rankingRows.forEach(function (r) { if (!seenDay[r.event_day]) { seenDay[r.event_day] = true; days.push(r.event_day); } });
      days.sort();

      var byDay = {};
      days.forEach(function (day) {
        var dayRows = rankingRows.filter(function (r) { return r.event_day === day; });
        var countries = {};
        COUNTRIES.forEach(function (c) {
          var cRows = dayRows.filter(function (r) { return r.country === c; });
          var totals = { catalogo: 0, memoryMatch: 0 };
          cRows.forEach(function (r) { if (r.experience === "catalogo") totals.catalogo++; else totals.memoryMatch++; });
          totals.anonymous = anonByCountryDay[c + "|" + day] || 0;
          countries[c] = { totals: totals, top5: combinedRanking(cRows) };
        });
        var tables = {};
        COUNTRIES.forEach(function (c) {
          EXPERIENCES.forEach(function (e) {
            tables[c + "_" + e] = dayRows.filter(function (r) { return r.country === c && r.experience === e; })
              .map(function (r) { return { name: r.participant_name || "Anónimo", score: Number(r.score), submittedAt: r.submitted_at }; })
              .sort(function (a, b) { return b.score - a.score; });
          });
        });
        byDay[day] = { countries: countries, tables: tables };
      });

      var allCountries = {};
      COUNTRIES.forEach(function (c) {
        var cRows = rankingRows.filter(function (r) { return r.country === c; });
        var totals = { catalogo: 0, memoryMatch: 0 };
        cRows.forEach(function (r) { if (r.experience === "catalogo") totals.catalogo++; else totals.memoryMatch++; });
        totals.anonymous = anonByCountry[c] || 0;
        allCountries[c] = { totals: totals, top5: combinedRanking(cRows) };
      });
      var allTables = {};
      COUNTRIES.forEach(function (c) {
        EXPERIENCES.forEach(function (e) {
          allTables[c + "_" + e] = rankingRows.filter(function (r) { return r.country === c && r.experience === e; })
            .map(function (r) { return { name: r.participant_name || "Anónimo", score: Number(r.score), submittedAt: r.submitted_at }; })
            .sort(function (a, b) { return b.score - a.score; });
        });
      });

      var bucketMap = {};
      rankingRows.forEach(function (r) {
        var fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ_BY_COUNTRY[r.country], year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
        var parts = {};
        fmt.formatToParts(new Date(r.submitted_at)).forEach(function (p) { parts[p.type] = p.value; });
        var hourKey = parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":00";
        var key = r.country + "|" + r.experience + "|" + hourKey;
        bucketMap[key] = (bucketMap[key] || 0) + 1;
        r._hourKey = hourKey;
      });
      var hours = [];
      var seenHour = {};
      rankingRows.forEach(function (r) { if (!seenHour[r._hourKey]) { seenHour[r._hourKey] = true; hours.push(r._hourKey); } });
      hours.sort();
      var series = {};
      COUNTRIES.forEach(function (c) {
        EXPERIENCES.forEach(function (e) {
          series[c + "_" + e] = hours.map(function (h) { return bucketMap[c + "|" + e + "|" + h] || 0; });
        });
      });

      return {
        updatedAtLabel: new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }),
        days: days,
        registrations: registrations,
        byDay: byDay,
        all: { countries: allCountries, tables: allTables },
        hours: hours,
        series: series,
        products: products,
      };
    });
  }

  function refresh() {
    var btn = document.getElementById("refresh-btn");
    var label = document.getElementById("refresh-btn-label");
    btn.disabled = true;
    btn.classList.add("loading");
    label.textContent = "Actualizando…";
    loadAll()
      .then(function (stats) {
        render(stats);
        label.textContent = "Actualizado ✓";
      })
      .catch(function (err) {
        label.textContent = "Error, reintenta";
        console.error("Mirage Pulso:", err);
      })
      .finally(function () {
        btn.classList.remove("loading");
        btn.disabled = false;
        setTimeout(function () { label.textContent = "Actualizar"; }, 2500);
      });
  }

  document.getElementById("refresh-btn").addEventListener("click", refresh);
  refresh();
})();
