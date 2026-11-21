/* global window, echarts */
/**
 * 图表渲染模块 — 从 app.js 拆分
 * 所有 ECharts / HTML chart 渲染函数统一放在此模块
 * 挂载到 window.ChartRenderer
 */
(function () {
  'use strict';

  var CHART_THEME = {
    primary: '#4f8cff',
    secondary: '#34d399',
    accent: '#f59e0b',
    danger: '#ef4444',
    muted: '#94a3b8',
  };

  var fullscreenCard = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeCharts(charts) {
    var safe = charts && typeof charts === 'object' ? charts : {};
    var radar = safe.radar && typeof safe.radar === 'object' ? safe.radar : {};
    var bar = safe.bar && typeof safe.bar === 'object' ? safe.bar : {};
    var line = safe.line && typeof safe.line === 'object' ? safe.line : {};
    var gauge = safe.gauge && typeof safe.gauge === 'object' ? safe.gauge : {};
    return {
      radar: {
        indicators: Array.isArray(radar.indicators) ? radar.indicators : [],
        series: Array.isArray(radar.series) ? radar.series : [],
      },
      bar: {
        categories: Array.isArray(bar.categories) ? bar.categories : [],
        series: Array.isArray(bar.series) ? bar.series : [],
      },
      line: {
        categories: Array.isArray(line.categories) ? line.categories : [],
        series: Array.isArray(line.series) ? line.series : [],
      },
      gauge: {
        value: Number.isFinite(Number(gauge.value)) ? Number(gauge.value) : 0,
      },
    };
  }

  function renderNoDataPlaceholder(title, desc) {
    return (
      '<div class="chart-box">' +
      '<h3 style="margin:0 0 8px 0;color:' + CHART_THEME.muted + ';">' +
      escapeHtml(title) +
      '</h3>' +
      '<p style="margin:0;color:#cbd5e1;">' +
      escapeHtml(desc || '暂无可展示数据') +
      '</p>' +
      '</div>'
    );
  }

  function renderGauge(value) {
    var score = Math.max(0, Math.min(100, Number(value) || 0));
    var color = score >= 75 ? CHART_THEME.secondary : score >= 50 ? CHART_THEME.accent : CHART_THEME.danger;
    return (
      '<div class="chart-box"><h3 style="margin:0 0 8px 0;">综合评分</h3>' +
      '<div style="font-size:30px;font-weight:700;color:' + color + ';">' +
      score.toFixed(1) +
      '</div>' +
      '<div style="height:8px;margin-top:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;">' +
      '<div style="height:100%;width:' + score + '%;background:' + color + ';"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSimpleBars(categories, values, color) {
    if (!categories.length || !values.length) return renderNoDataPlaceholder('柱状图', '当前查询未返回可比较维度');
    var maxVal = Math.max.apply(null, values.map(function (v) { return Number(v) || 0; }));
    return (
      '<div class="chart-box"><h3 style="margin:0 0 8px 0;">证据分布</h3>' +
      categories
        .map(function (c, idx) {
          var v = Number(values[idx]) || 0;
          var width = maxVal > 0 ? Math.max(5, Math.round((v / maxVal) * 100)) : 5;
          return (
            '<div style="margin:8px 0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:#d1d5db;"><span>' +
            escapeHtml(c) + '</span><span>' + v + '</span></div>' +
            '<div style="height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;">' +
            '<div style="height:100%;width:' + width + '%;background:' + color + ';"></div>' +
            '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderLineSummary(categories, values) {
    if (!categories.length || !values.length) return renderNoDataPlaceholder('趋势图', '暂无时间序列数据');
    var points = categories
      .map(function (c, i) { return escapeHtml(c) + ': ' + (Number(values[i]) || 0); })
      .join(' | ');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">时间趋势</h3><p style="margin:0;color:#d1d5db;">' + points + '</p></div>';
  }

  function renderRadarSummary(indicators, values) {
    if (!indicators.length || !values.length) return renderNoDataPlaceholder('雷达图', '暂无能力维度评分');
    var lines = indicators
      .map(function (it, i) {
        var n = typeof it === 'object' ? it.name : String(it);
        return '<div style="display:flex;justify-content:space-between;margin:6px 0;"><span>' + escapeHtml(n) + '</span><span style="color:' + CHART_THEME.secondary + ';">' + (Number(values[i]) || 0) + '</span></div>';
      })
      .join('');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">综合能力雷达</h3>' + lines + '</div>';
  }

  function renderScatterChart(scatter) {
    var series = (scatter && scatter.series) || [];
    if (!series.length) return renderNoDataPlaceholder('散点图', '暂无风险-收益数据');
    var rows = series
      .map(function (s) {
        var p = (s.data && s.data[0]) || [0, 0];
        return '<div style="display:flex;justify-content:space-between;margin:6px 0;"><span>' + escapeHtml(s.name || '-') + '</span><span style="color:' + CHART_THEME.accent + ';">风险 ' + p[0] + ' / 收益 ' + p[1] + '</span></div>';
      })
      .join('');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">风险-收益散点</h3>' + rows + '</div>';
  }

  function renderWordcloud(items) {
    var arr = Array.isArray(items) ? items : [];
    if (!arr.length) return renderNoDataPlaceholder('词云', '暂无关键词数据');
    var tags = arr
      .map(function (t) {
        var w = Number(t.weight) || 10;
        var size = Math.max(12, Math.min(28, 10 + Math.round(w / 2)));
        return '<span style="display:inline-block;margin:6px 8px;font-size:' + size + 'px;color:' + CHART_THEME.secondary + ';">' + escapeHtml(t.text || '-') + '</span>';
      })
      .join('');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">关键词词云</h3>' + tags + '</div>';
  }

  function renderHeatmapChart(heatmap) {
    var cats = (heatmap && heatmap.categories) || [];
    var values = (heatmap && heatmap.values) || [];
    if (!cats.length || !values.length) return renderNoDataPlaceholder('热力图', '暂无热力分布数据');
    var maxVal = Math.max.apply(null, values.map(function (v) { return Number(v) || 0; }));
    var cells = cats
      .map(function (c, i) {
        var v = Number(values[i]) || 0;
        var alpha = maxVal > 0 ? Math.max(0.12, v / maxVal) : 0.12;
        return '<div style="display:inline-block;padding:6px 8px;margin:4px;border-radius:6px;background:rgba(239,68,68,' + alpha.toFixed(2) + ');">' + escapeHtml(c) + ' (' + v + ')</div>';
      })
      .join('');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">日历热力</h3>' + cells + '</div>';
  }

  function renderStackedBarChart(stacked) {
    var categories = (stacked && stacked.categories) || [];
    var series = (stacked && stacked.series) || [];
    if (!categories.length || !series.length) return renderNoDataPlaceholder('堆积柱状图', '暂无案件分布数据');
    var colorsArr = [CHART_THEME.primary, CHART_THEME.danger, CHART_THEME.accent, CHART_THEME.secondary];
    var rows = categories
      .map(function (cat, idx) {
        var vals = series.map(function (s) { return Number((s.data || [])[idx]) || 0; });
        var total = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
        var segments = vals
          .map(function (v, i) {
            var w = Math.max(5, Math.round((v / total) * 100));
            return '<span style="display:inline-block;height:100%;width:' + w + '%;background:' + colorsArr[i % colorsArr.length] + ';"></span>';
          })
          .join('');
        return '<div style="margin:10px 0;"><div style="display:flex;justify-content:space-between;font-size:12px;"><span>' + escapeHtml(cat) + '</span><span>' + total + '</span></div><div style="height:10px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;">' + segments + '</div></div>';
      })
      .join('');
    return '<div class="chart-box"><h3 style="margin:0 0 8px 0;">司法案件结构</h3>' + rows + '</div>';
  }

  // ── ECharts rendering ──

  function renderEChartsGauge(el, gaugeInput) {
    if (!el || !window.echarts) return false;
    var payload = typeof gaugeInput === 'object' && gaugeInput !== null && !Array.isArray(gaugeInput)
      ? gaugeInput
      : { value: gaugeInput, rating: '', title: '综合评分' };
    var score = Math.max(0, Math.min(100, Number(payload.value) || 0));
    var titleText = payload.title ? String(payload.title) : '综合评分';
    var ratingStr = payload.rating != null && payload.rating !== '' ? String(payload.rating) : '';
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: titleText, left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      series: [{
        type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, splitNumber: 5,
        progress: { show: true, width: 14 },
        axisLine: { lineStyle: { width: 14, color: [[0.5, CHART_THEME.danger], [0.75, CHART_THEME.accent], [1, CHART_THEME.secondary]] } },
        axisTick: { distance: -16, length: 6, lineStyle: { color: 'rgba(255,255,255,.4)' } },
        splitLine: { distance: -16, length: 12, lineStyle: { color: 'rgba(255,255,255,.5)' } },
        axisLabel: { color: 'rgba(255,255,255,.65)' },
        pointer: { show: true, length: '62%', width: 6 },
        anchor: { show: true, showAbove: true, size: 10, itemStyle: { color: CHART_THEME.primary } },
        detail: {
          valueAnimation: true,
          formatter: function (val) {
            var s = Number(val).toFixed(1);
            return ratingStr ? s + ' · ' + ratingStr : s;
          },
          color: '#fff', fontSize: 22, offsetCenter: [0, '65%'],
        },
        data: [{ value: Number(score.toFixed(1)) }],
      }],
    });
    el.__chart__ = chart;
    return true;
  }

  function renderEChartsScatter(el, scatter) {
    if (!el || !window.echarts) return false;
    var series = (scatter && scatter.series) || [];
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '风险-收益散点', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      grid: { left: 46, right: 22, top: 56, bottom: 40 },
      xAxis: { type: 'value', name: '风险', nameTextStyle: { color: 'rgba(255,255,255,.7)' }, axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      yAxis: { type: 'value', name: '收益', nameTextStyle: { color: 'rgba(255,255,255,.7)' }, axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      tooltip: { trigger: 'item' },
      series: series.length
        ? series.map(function (s, idx) {
            return { type: 'scatter', name: s.name || ('企业' + (idx + 1)), data: Array.isArray(s.data) ? s.data : [], symbolSize: 14 };
          })
        : [{ type: 'scatter', data: [] }],
      legend: { top: 30, textStyle: { color: 'rgba(255,255,255,.75)' } },
    });
    el.__chart__ = chart;
    return true;
  }

  function renderRadarChart(el, radar) {
    if (!el || !window.echarts) return false;
    var inds = (radar && radar.indicators) || [];
    var series = (radar && radar.series) || [];
    var palette = [CHART_THEME.primary, CHART_THEME.secondary, CHART_THEME.accent, '#d6b97a', '#a78bfa'];
    var radarData = series
      .map(function (s, idx) {
        var values = Array.isArray(s.value) ? s.value : [];
        return { value: values, name: s.name || '企业' + (idx + 1), color: palette[idx % palette.length] };
      })
      .filter(function (d) { return d.value.length > 0; });
    if (!inds.length || !radarData.length) {
      el.innerHTML = renderNoDataPlaceholder('雷达图', '暂无能力维度数据');
      return true;
    }
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '综合能力雷达', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      legend: radarData.length > 1
        ? { top: 32, textStyle: { color: 'rgba(255,255,255,.75)' }, data: radarData.map(function (d) { return d.name; }) }
        : undefined,
      radar: {
        indicator: inds.map(function (it) {
          if (typeof it === 'object') return { name: it.name || '-', max: it.max || 100 };
          return { name: String(it), max: 100 };
        }),
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,.02)'] } },
        axisName: { color: 'rgba(255,255,255,.7)' },
      },
      series: [{
        type: 'radar',
        data: radarData.map(function (d) {
          return { value: d.value, name: d.name, areaStyle: { opacity: 0.12 }, lineStyle: { color: d.color }, itemStyle: { color: d.color } };
        }),
      }],
    });
    el.__chart__ = chart;
    return true;
  }

  function renderBarChart(el, bar) {
    if (!el || !window.echarts) return false;
    var cats = (bar && bar.categories) || [];
    var series = (bar && bar.series) || [];
    var first = series[0] || {};
    var data = Array.isArray(first.data) ? first.data : [];
    if (!cats.length || !data.length) { el.innerHTML = renderNoDataPlaceholder('柱状图', '暂无对比数据'); return true; }
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '对比柱状图', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      grid: { left: 56, right: 18, top: 56, bottom: 42 },
      xAxis: { type: 'category', data: cats, axisLabel: { color: 'rgba(255,255,255,.65)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ type: 'bar', data: data, itemStyle: { color: CHART_THEME.primary }, barMaxWidth: 24 }],
      tooltip: { trigger: 'axis' },
    });
    el.__chart__ = chart;
    return true;
  }

  function renderLineChart(el, line) {
    if (!el || !window.echarts) return false;
    var cats = (line && line.categories) || [];
    var series = (line && line.series) || [];
    var first = series[0] || {};
    var data = Array.isArray(first.data) ? first.data : [];
    if (!cats.length || !data.length) { el.innerHTML = renderNoDataPlaceholder('折线图', '暂无趋势数据'); return true; }
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '趋势折线', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      grid: { left: 56, right: 18, top: 56, bottom: 42 },
      xAxis: { type: 'category', data: cats, axisLabel: { color: 'rgba(255,255,255,.65)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ type: 'line', data: data, smooth: true, symbolSize: 6, lineStyle: { color: CHART_THEME.secondary }, itemStyle: { color: CHART_THEME.secondary } }],
      tooltip: { trigger: 'axis' },
    });
    el.__chart__ = chart;
    return true;
  }

  function renderStackedBar(el, stacked) {
    if (!el || !window.echarts) return false;
    var cats = (stacked && stacked.categories) || [];
    var series = (stacked && stacked.series) || [];
    if (!cats.length || !series.length) { el.innerHTML = renderNoDataPlaceholder('堆积柱状图', '暂无司法/结构数据'); return true; }
    var colors = [CHART_THEME.primary, CHART_THEME.danger, CHART_THEME.accent, CHART_THEME.secondary];
    var s = series.map(function (x, idx) {
      return { type: 'bar', name: x.name || ('类型' + (idx + 1)), stack: 'total', data: Array.isArray(x.data) ? x.data : [], itemStyle: { color: colors[idx % colors.length] } };
    });
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '结构堆积', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      grid: { left: 56, right: 18, top: 56, bottom: 42 },
      xAxis: { type: 'category', data: cats, axisLabel: { color: 'rgba(255,255,255,.65)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      legend: { top: 30, textStyle: { color: 'rgba(255,255,255,.75)' } },
      series: s,
      tooltip: { trigger: 'axis' },
    });
    el.__chart__ = chart;
    return true;
  }

  function renderHeatmap(el, heatmap) {
    if (!el || !window.echarts) return false;
    var cats = (heatmap && heatmap.categories) || [];
    var vals = (heatmap && heatmap.values) || [];
    if (!cats.length || !vals.length) { el.innerHTML = renderNoDataPlaceholder('热力图', '暂无热力分布'); return true; }
    var data = cats.map(function (c, i) { return [c, Number(vals[i]) || 0]; });
    var chart = window.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: '热力分布', left: 12, top: 10, textStyle: { color: '#e5e7eb', fontSize: 14 } },
      grid: { left: 96, right: 18, top: 56, bottom: 18 },
      xAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      yAxis: { type: 'category', data: cats, axisLabel: { color: 'rgba(255,255,255,.65)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      series: [{ type: 'bar', data: data.map(function (x) { return x[1]; }), itemStyle: { color: CHART_THEME.danger }, barMaxWidth: 10 }],
      tooltip: { trigger: 'axis' },
    });
    el.__chart__ = chart;
    return true;
  }

  function createChartCard(title, badge) {
    var wrap = document.createElement('div');
    wrap.className = 'chart-card chart-box';
    wrap.style.height = '350px';
    var header = document.createElement('div');
    header.className = 'chart-card-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';
    header.innerHTML =
      '<strong>' + escapeHtml(title || '图表') + '</strong>' +
      (badge ? '<span style="font-size:12px;color:#94a3b8;">' + escapeHtml(badge) + '</span>' : '');
    var body = document.createElement('div');
    body.className = 'chart-card-body';
    body.style.height = '290px';
    var resizer = document.createElement('div');
    resizer.className = 'chart-resizer';
    var resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    resizer.addEventListener('mousedown', function (evt) {
      evt.preventDefault(); evt.stopPropagation();
      resizing = true; sx = evt.clientX; sy = evt.clientY;
      sw = wrap.offsetWidth; sh = wrap.offsetHeight;
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', function (evt) {
      if (!resizing) return;
      var nextW = Math.max(400, sw + (evt.clientX - sx));
      var nextH = Math.max(280, sh + (evt.clientY - sy));
      wrap.style.width = nextW + 'px';
      wrap.style.height = nextH + 'px';
      body.style.height = Math.max(200, nextH - 60) + 'px';
      resizeCardChart(wrap);
    });
    window.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = false;
      document.body.style.userSelect = '';
    });
    wrap.addEventListener('dblclick', function () { toggleCardFullscreen(wrap); });
    wrap.appendChild(header);
    wrap.appendChild(body);
    wrap.appendChild(resizer);
    return { card: wrap, box: body };
  }

  function resizeCardChart(card) {
    if (!card) return;
    var body = card.querySelector('.chart-card-body');
    if (!body) return;
    if (body.__chart__ && typeof body.__chart__.resize === 'function') body.__chart__.resize();
  }

  function toggleCardFullscreen(card) {
    if (!card) return;
    if (fullscreenCard && fullscreenCard !== card) {
      fullscreenCard.classList.remove('chart-card-fullscreen');
      resizeCardChart(fullscreenCard);
      fullscreenCard = null;
    }
    var entering = !card.classList.contains('chart-card-fullscreen');
    if (entering) { card.classList.add('chart-card-fullscreen'); fullscreenCard = card; }
    else { card.classList.remove('chart-card-fullscreen'); if (fullscreenCard === card) fullscreenCard = null; }
    resizeCardChart(card);
  }

  function getChartGrid() {
    var content = document.getElementById('chartContent');
    if (!content) return null;
    var grid = document.getElementById('chartGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'chartGrid';
      content.appendChild(grid);
    }
    return grid;
  }

  function adjustChartLayout() {
    var chartGrid = document.getElementById('chartGrid');
    if (!chartGrid) return;
    var cards = Array.from(chartGrid.querySelectorAll('.chart-card'));
    if (cards.length === 1) {
      cards[0].classList.add('fullscreen-card');
      cards[0].style.height = '80vh';
      cards[0].style.width = '100%';
      resizeCardChart(cards[0]);
      return;
    }
    cards.forEach(function (card) {
      card.classList.remove('fullscreen-card');
      card.style.width = '';
      card.style.height = '350px';
      resizeCardChart(card);
    });
  }

  function renderRankingBarChart(rankingBar, chartGrid, cardTitle) {
    if (!chartGrid || !window.echarts) return false;
    var categories = (rankingBar && rankingBar.categories) || [];
    var series = (rankingBar && rankingBar.series) || [];
    if (!categories.length || !series.length) return false;
    var ratings = (rankingBar && rankingBar.ratings) || [];
    var c = createChartCard(cardTitle || '🏆 综合排名', 'comparison_ranking');
    chartGrid.appendChild(c.card);
    var inst = window.echarts.init(c.box, null, { renderer: 'canvas' });
    var values = Array.isArray(series[0].data) ? series[0].data : [];
    var barData = values.map(function (v, idx) {
      var num = typeof v === 'object' && v !== null && 'value' in v ? Number(v.value) : Number(v);
      var r = (typeof v === 'object' && v !== null && v.rating != null && v.rating !== '' ? String(v.rating) : ratings[idx] != null ? String(ratings[idx]) : '') || '';
      return { value: num, rating: r, itemStyle: { color: idx === 0 ? '#d6b97a' : CHART_THEME.primary } };
    });
    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 70, right: 56, top: 16, bottom: 30, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      yAxis: { type: 'category', data: categories, axisLabel: { color: 'rgba(255,255,255,.72)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      series: [{
        type: 'bar', data: barData,
        label: { show: true, position: 'right', color: 'rgba(255,245,225,.92)',
          formatter: function (params) {
            var d = params.data; var r = d && d.rating ? d.rating : '';
            var val = d && typeof d.value !== 'undefined' ? d.value : params.value;
            var num = Number(val);
            if ((!num && num !== 0) || (num === 0 && (!r || r === '-'))) return '暂无本地评分';
            return r ? num + '  ' + r : String(num);
          },
        },
      }],
      tooltip: { trigger: 'axis' },
    });
    return true;
  }

  function renderMetricSeriesCard(metricSeries, metricDisplayName) {
    if (!window.echarts) return false;
    var chartGrid = getChartGrid();
    if (!chartGrid) return false;
    var metricName = metricDisplayName(metricSeries.metric);
    var c = createChartCard('📈 ' + metricName + '趋势', 'simple_metric');
    chartGrid.appendChild(c.card);
    var categories = Array.isArray(metricSeries.categories) ? metricSeries.categories : [];
    var s0 = (metricSeries.series && metricSeries.series[0]) || { name: '指标', data: [] };
    var preferredType = metricSeries.type === 'line' || metricSeries.type === 'bar' ? metricSeries.type : null;
    var inst = window.echarts.init(c.box, null, { renderer: 'canvas' });
    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 56, right: 18, top: 30, bottom: 42 },
      xAxis: { type: 'category', data: categories, axisLabel: { color: 'rgba(255,255,255,.65)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,.65)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ type: preferredType || (categories.length > 1 ? 'line' : 'bar'), data: Array.isArray(s0.data) ? s0.data : [], smooth: true, itemStyle: { color: CHART_THEME.primary }, lineStyle: { color: CHART_THEME.primary } }],
      tooltip: { trigger: 'axis' },
    });
    return true;
  }

  function renderCharts(charts, answer, metricDisplayNameFn) {
    window.__LAST_CHARTS__ = charts;
    var content = document.getElementById('chartContent');
    var chartGrid = getChartGrid();
    if (!content || !chartGrid) return;

    var chartType = (charts && charts.chart_type) || 'analysis';
    chartGrid.innerHTML = '';

    if (chartType === 'simple_metric' && charts && charts.metric_series) {
      renderMetricSeriesCard(charts.metric_series, metricDisplayNameFn);
      adjustChartLayout();
      return;
    }
    if (chartType === 'analysis') {
      var radarCard = createChartCard('📊 综合能力雷达', 'analysis_radar');
      chartGrid.appendChild(radarCard.card);
      renderRadarChart(radarCard.box, (charts && charts.radar) || {});
      var scatterCard = createChartCard('🎯 风险-收益散点', 'analysis_scatter');
      chartGrid.appendChild(scatterCard.card);
      renderEChartsScatter(scatterCard.box, (charts && charts.scatter) || {});
      var g = charts && charts.gauge;
      if (g && typeof g === 'object' && Number.isFinite(Number(g.value))) {
        var gaugeCard = createChartCard(String(g.title || '综合评分'), 'analysis_gauge');
        chartGrid.appendChild(gaugeCard.card);
        renderEChartsGauge(gaugeCard.box, g);
      }
      adjustChartLayout();
      return;
    }
    if (chartType === 'ranking' || chartType === 'bar') {
      var barPayload = charts && charts.bar;
      if (barPayload && Array.isArray(barPayload.categories) && barPayload.categories.length) {
        var rb = {
          categories: barPayload.categories,
          series: barPayload.series && barPayload.series.length ? barPayload.series : [{ name: '指标', data: [] }],
          ratings: barPayload.ratings || [],
        };
        var ct = barPayload.metric_title ? '📊 ' + String(barPayload.metric_title) : '📊 排行榜';
        renderRankingBarChart(rb, chartGrid, ct);
      } else {
        var rc = createChartCard('📊 排行榜', 'ranking');
        chartGrid.appendChild(rc.card);
        rc.box.innerHTML = renderNoDataPlaceholder('排行榜', '暂无可展示的排行数据，请补充企业范围或稍后重试');
      }
      adjustChartLayout();
      return;
    }
    if (chartType === 'comparison_ranking') {
      if (charts && charts.ranking_bar) renderRankingBarChart(charts.ranking_bar, chartGrid);
      if (charts && charts.radar) {
        var rc2 = createChartCard('🕸️ 综合能力雷达', 'comparison_radar');
        chartGrid.appendChild(rc2.card);
        renderRadarChart(rc2.box, charts.radar);
      }
      if (charts && charts.scatter) {
        var sc = createChartCard('🎯 风险-收益散点', 'scatter');
        chartGrid.appendChild(sc.card);
        renderEChartsScatter(sc.box, charts.scatter);
      }
      adjustChartLayout();
      return;
    }
    if (chartType === 'legal_risk') {
      var legalCard = createChartCard('⚖️ 司法风险分析', 'legal_risk');
      chartGrid.appendChild(legalCard.card);
      legalCard.box.style.display = 'grid';
      legalCard.box.style.gridTemplateColumns = '1fr 1fr';
      legalCard.box.style.gap = '10px';
      var stackedEl = document.createElement('div'); stackedEl.style.height = '100%';
      var heatmapEl = document.createElement('div'); heatmapEl.style.height = '100%';
      var noteEl = document.createElement('div');
      noteEl.style.gridColumn = '1 / span 2';
      noteEl.style.fontSize = '12px';
      noteEl.style.color = 'rgba(255,255,255,.72)';
      noteEl.style.padding = '2px 4px 0 4px';
      legalCard.box.innerHTML = '';
      legalCard.box.appendChild(stackedEl);
      legalCard.box.appendChild(heatmapEl);
      legalCard.box.appendChild(noteEl);
      renderStackedBar(stackedEl, (charts && charts.stacked_bar) || {});
      renderHeatmap(heatmapEl, (charts && charts.heatmap) || {});
      var stacked = (charts && charts.stacked_bar) || {};
      var heatmapObj = (charts && charts.heatmap) || {};
      var sumA = 0;
      ((stacked.series || [])).forEach(function (s) {
        ((s && s.data) || []).forEach(function (v) { var n = Number(v); if (!Number.isNaN(n)) sumA += n; });
      });
      var sumB = 0;
      ((heatmapObj.values || [])).forEach(function (v) { var n = Number(v); if (!Number.isNaN(n)) sumB += n; });
      noteEl.textContent = (sumA === 0 && sumB === 0) ? '当前仅有司法风险评分，暂无可展示的诉讼明细数据。' : '';
      adjustChartLayout();
      return;
    }
    if (chartType === 'sentiment') {
      var sentimentCard = createChartCard('📰 舆情分析', 'sentiment');
      chartGrid.appendChild(sentimentCard.card);
      if (charts && charts.line && Array.isArray(charts.line.categories) && charts.line.categories.length) {
        renderLineChart(sentimentCard.box, charts.line);
      } else {
        var sHint = (charts && charts.sentiment_hint) || '暂无舆情数据可视化';
        sentimentCard.box.innerHTML = renderNoDataPlaceholder('舆情分析', String(sHint));
      }
      adjustChartLayout();
      return;
    }
    if (chartType === 'general') {
      var generalCard = createChartCard('通用分析摘要', 'general');
      chartGrid.appendChild(generalCard.card);
      var summary = answer && (answer.user_facing_reply || answer.summary);
      generalCard.box.innerHTML = summary
        ? '<div class="chart-box"><p style="margin:0;color:#d1d5db;">' + escapeHtml(summary) + '</p></div>'
        : renderNoDataPlaceholder('通用分析', '当前查询未返回可视化图表');
      adjustChartLayout();
      return;
    }

    // Generic fallback: render any charts that have data
    if (charts && charts.scatter && Array.isArray(charts.scatter.series) && charts.scatter.series.length) {
      var scCard = createChartCard('风险-收益散点', 'scatter');
      chartGrid.appendChild(scCard.card);
      renderEChartsScatter(scCard.box, charts.scatter);
    }
    if (charts && charts.radar && Array.isArray(charts.radar.series) && charts.radar.series.length) {
      var radCard = createChartCard('综合能力雷达', 'radar');
      chartGrid.appendChild(radCard.card);
      renderRadarChart(radCard.box, charts.radar);
    }
    if (charts && charts.ranking_bar && Array.isArray(charts.ranking_bar.categories) && charts.ranking_bar.categories.length) {
      renderRankingBarChart(charts.ranking_bar, chartGrid);
    }
    if (charts && charts.bar && Array.isArray(charts.bar.categories) && charts.bar.categories.length) {
      var barCard = createChartCard('📊 对比柱状图', 'bar');
      chartGrid.appendChild(barCard.card);
      renderBarChart(barCard.box, charts.bar);
    }
    if (charts && charts.line && Array.isArray(charts.line.categories) && charts.line.categories.length) {
      var lineCard = createChartCard('📈 趋势折线', 'line');
      chartGrid.appendChild(lineCard.card);
      renderLineChart(lineCard.box, charts.line);
    }
    if (charts && charts.stacked_bar && Array.isArray(charts.stacked_bar.categories) && charts.stacked_bar.categories.length) {
      var stackedCard = createChartCard('结构堆积', 'stacked_bar');
      chartGrid.appendChild(stackedCard.card);
      renderStackedBar(stackedCard.box, charts.stacked_bar);
    }
    if (charts && charts.heatmap && Array.isArray(charts.heatmap.categories) && charts.heatmap.categories.length) {
      var hmCard = createChartCard('热力分布', 'heatmap');
      chartGrid.appendChild(hmCard.card);
      renderHeatmap(hmCard.box, charts.heatmap);
    }
    if (charts && charts.wordcloud && Array.isArray(charts.wordcloud) && charts.wordcloud.length) {
      var wcCard = createChartCard('关键词词云', 'wordcloud');
      chartGrid.appendChild(wcCard.card);
      wcCard.box.innerHTML = renderWordcloud(charts.wordcloud);
    }
    adjustChartLayout();
  }

  // ── Public API ──

  window.ChartRenderer = {
    CHART_THEME: CHART_THEME,
    escapeHtml: escapeHtml,
    normalizeCharts: normalizeCharts,
    renderNoDataPlaceholder: renderNoDataPlaceholder,
    renderGauge: renderGauge,
    renderSimpleBars: renderSimpleBars,
    renderLineSummary: renderLineSummary,
    renderRadarSummary: renderRadarSummary,
    renderScatterChart: renderScatterChart,
    renderWordcloud: renderWordcloud,
    renderHeatmapChart: renderHeatmapChart,
    renderStackedBarChart: renderStackedBarChart,
    renderEChartsGauge: renderEChartsGauge,
    renderEChartsScatter: renderEChartsScatter,
    renderRadarChart: renderRadarChart,
    renderBarChart: renderBarChart,
    renderLineChart: renderLineChart,
    renderStackedBar: renderStackedBar,
    renderHeatmap: renderHeatmap,
    renderCharts: renderCharts,
    renderRankingBarChart: renderRankingBarChart,
    renderMetricSeriesCard: renderMetricSeriesCard,
    createChartCard: createChartCard,
    resizeCardChart: resizeCardChart,
    toggleCardFullscreen: toggleCardFullscreen,
    getChartGrid: getChartGrid,
    adjustChartLayout: adjustChartLayout,
  };
})();
