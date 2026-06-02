/* global echarts, Sortable */
(function () {
  'use strict';

  function getToken() {
    return localStorage.getItem('token') || '';
  }
  function toLoginPage() {
    // 优先绝对路径，失败时回退相对路径，兼容不同静态挂载前缀。
    window.location.replace('/web/login.html');
    setTimeout(function () {
      if (!/\/web\/login\.html(?:$|\?)/.test(window.location.pathname)) {
        window.location.replace('./login.html');
      }
    }, 120);
  }
  (function checkLogin() {
    if (!getToken()) toLoginPage();
  })();

  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const btnEvidence = document.getElementById('btnEvidence');
  const evidencePanel = document.getElementById('evidencePanel');
  const sourcePanel = document.getElementById('sourcePanel');
  const refreshSourcesBtn = document.getElementById('refreshSourcesBtn');
  const agentStatus = document.getElementById('agentStatus');
  const agentError = document.getElementById('agentError');
  const chartPanel = document.getElementById('chartPanel');
  const toggleChartBtn = document.getElementById('toggleChartBtn');
  const collapseChartBtn = document.getElementById('collapseChartBtn');
  const chartContent = document.getElementById('chartContent');

  let currentSessionId = '';
  let userCollapsedChartThisSession = false;
  const chartInstances = new Map();

  function safeText(v, fallback) {
    const f = fallback === undefined ? '-' : fallback;
    if (v === undefined || v === null || v === '') return f;
    return String(v);
  }

  function append(role, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  function extractErrorMessage(payload) {
    if (!payload) return '请求失败';
    const raw = payload.detail ?? payload.message ?? payload.msg ?? payload.error ?? payload;
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw);
    } catch (_) {
      return '请求失败';
    }
  }

  function unwrapApi(data) {
    if (data && typeof data === 'object' && 'code' in data && 'data' in data) return data.data;
    return data;
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res
        .json()
        .catch(function () {
          return res.text().then(function (t) {
            return { detail: t };
          });
        })
        .then(function (data) {
          if (!res.ok) throw new Error(extractErrorMessage(data));
          return unwrapApi(data);
        });
    });
  }

  function renderSources(sources) {
    if (!sources || !sources.length) {
      sourcePanel.textContent = '暂无证据';
      btnEvidence.textContent = '证据';
      return;
    }
    btnEvidence.textContent = '证据 (' + sources.length + ')';
    sourcePanel.textContent = sources
      .map(function (item, i) {
        return [
          i + 1 + '. [' + safeText(item.evidence_id) + '] ' + safeText(item.title),
          '来源: ' + safeText(item.source_type) + '/' + safeText(item.source),
          '置信度: ' + safeText(item.confidence),
          '链接: ' + safeText(item.url_or_path, 'N/A'),
          '摘要: ' + safeText(item.excerpt),
        ].join('\n');
      })
      .join('\n\n');
  }

  function isChartCollapsed() {
    return localStorage.getItem('chartPanelCollapsed') === '1';
  }
  function syncChartButtons() {
    const collapsed = isChartCollapsed();
    collapseChartBtn.textContent = collapsed ? '展开' : '收起';
    toggleChartBtn.textContent = collapsed ? '展开左侧' : '收起左侧';
  }
  function setChartCollapsed(collapsed, byUser) {
    localStorage.setItem('chartPanelCollapsed', collapsed ? '1' : '0');
    if (byUser) userCollapsedChartThisSession = !!collapsed;
    if (collapsed) chartPanel.classList.remove('show');
    syncChartButtons();
  }

  function destroyAllCharts() {
    chartInstances.forEach(function (inst) {
      try {
        inst.dispose();
      } catch (_) {}
    });
    chartInstances.clear();
  }

  function cardId() {
    return 'card_' + Math.random().toString(36).slice(2, 10);
  }

  function createChartCard(title, badge) {
    const id = cardId();
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.dataset.cardId = id;
    card.innerHTML = [
      '<div class="card-head">',
      '  <div class="card-title"><span>' + title + '</span>' + (badge ? '<span class="badge">' + badge + '</span>' : '') + '</div>',
      '  <div class="card-actions">',
      '    <button type="button" data-action="fullscreen" title="全屏">⤢</button>',
      '    <button type="button" data-action="close" title="关闭">✕</button>',
      '  </div>',
      '</div>',
      '<div class="card-body">',
      '  <div class="chart-box"></div>',
      '</div>',
    ].join('');

    const box = card.querySelector('.chart-box');
    card.addEventListener('click', function (e) {
      const t = e.target;
      if (!t || !t.getAttribute) return;
      const act = t.getAttribute('data-action');
      if (act === 'close') {
        const inst = chartInstances.get(id);
        if (inst) {
          try {
            inst.dispose();
          } catch (_) {}
          chartInstances.delete(id);
        }
        card.remove();
        return;
      }
      if (act === 'fullscreen') {
        card.classList.toggle('is-fullscreen');
        const inst2 = chartInstances.get(id);
        if (inst2) setTimeout(function () { inst2.resize(); }, 50);
      }
    });

    chartContent.appendChild(card);
    return { id: id, box: box };
  }

  function baseEChartsOption() {
    return {
      backgroundColor: 'transparent',
      textStyle: { color: 'rgba(234,240,255,.86)' },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(10,14,23,.92)', borderColor: 'rgba(124,92,255,.35)', textStyle: { color: '#eaf0ff' } },
      grid: { left: 42, right: 22, top: 42, bottom: 44 },
      animationDuration: 520,
    };
  }

  function renderMetricSeries(metricSeries) {
    const ent = safeText(metricSeries.enterprise, '');
    const metric = safeText(metricSeries.metric, '');
    const title = (ent ? ent + ' ' : '') + (metric ? metric : '指标');
    const c = createChartCard(title, 'simple_metric');
    const inst = echarts.init(c.box, null, { renderer: 'canvas' });
    chartInstances.set(c.id, inst);

    const categories = metricSeries.categories || [];
    const series = (metricSeries.series && metricSeries.series[0]) || { name: title, data: [] };
    const opt = Object.assign(baseEChartsOption(), {
      xAxis: { type: 'category', data: categories, axisLabel: { color: 'rgba(234,240,255,.72)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.12)' } } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(234,240,255,.72)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [
        {
          type: categories.length > 1 ? 'line' : 'bar',
          name: series.name || title,
          data: series.data || [],
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3, color: '#00d4ff' },
          itemStyle: { color: '#7c5cff' },
          areaStyle: categories.length > 1 ? { color: 'rgba(0,212,255,.12)' } : undefined,
        },
      ],
    });
    inst.setOption(opt);
  }

  function renderRankingBar(rankingBar) {
    const cats = rankingBar.categories || [];
    const s0 = (rankingBar.series && rankingBar.series[0]) || { name: '综合评分', data: [] };
    const data = s0.data || [];
    const n = cats.length;
    const horizontal = n > 15;
    const rotate = n > 8 ? 45 : 0;

    const c = createChartCard('综合排名（按总分降序）', 'comparison_ranking');
    const inst = echarts.init(c.box, null, { renderer: 'canvas' });
    chartInstances.set(c.id, inst);

    const barData = data.map(function (v, idx) {
      return {
        value: v,
        itemStyle: {
          color: idx === 0 ? '#d6b97a' : '#00d4ff',
          shadowBlur: idx === 0 ? 18 : 8,
          shadowColor: idx === 0 ? 'rgba(214,185,122,.35)' : 'rgba(0,212,255,.25)',
        },
      };
    });

    const opt = Object.assign(baseEChartsOption(), {
      grid: horizontal ? { left: 110, right: 22, top: 42, bottom: 30 } : { left: 46, right: 22, top: 42, bottom: 64 },
      xAxis: horizontal
        ? { type: 'value', axisLabel: { color: 'rgba(234,240,255,.72)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }
        : { type: 'category', data: cats, axisLabel: { color: 'rgba(234,240,255,.72)', rotate: rotate }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.12)' } } },
      yAxis: horizontal
        ? { type: 'category', data: cats, axisLabel: { color: 'rgba(234,240,255,.72)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.12)' } } }
        : { type: 'value', axisLabel: { color: 'rgba(234,240,255,.72)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [
        {
          type: 'bar',
          name: s0.name || '综合评分',
          data: barData,
          barWidth: horizontal ? 14 : Math.max(10, Math.min(22, 280 / Math.max(1, n))),
          label: {
            show: true,
            position: horizontal ? 'right' : 'top',
            color: 'rgba(234,240,255,.86)',
            formatter: function (p) { return safeText(p.value, '-') + (p.dataIndex === 0 ? ' 👑' : ''); },
          },
        },
      ],
    });
    inst.setOption(opt);
  }

  function renderLegalPlaceholder() {
    const c = createChartCard('司法风险（占位）', 'legal_risk');
    const inst = echarts.init(c.box, null, { renderer: 'canvas' });
    chartInstances.set(c.id, inst);
    const opt = Object.assign(baseEChartsOption(), {
      xAxis: { type: 'category', data: ['诉讼', '仲裁', '执行', '处罚'], axisLabel: { color: 'rgba(234,240,255,.72)' } },
      yAxis: { type: 'value', axisLabel: { color: 'rgba(234,240,255,.72)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ type: 'bar', data: [0, 0, 0, 0], itemStyle: { color: '#7c5cff' } }],
    });
    inst.setOption(opt);
  }

  function applySortable() {
    try {
      if (!window.Sortable) return;
      Sortable.create(chartContent, { animation: 150, ghostClass: 'drag-ghost', handle: '.card-head' });
    } catch (_) {}
  }

  function renderCharts(charts) {
    destroyAllCharts();
    chartContent.innerHTML = '';
    if (!charts || typeof charts !== 'object') return;
    const chartType = charts.chart_type || 'analysis';
    if (chartType === 'simple_metric' && charts.metric_series) {
      renderMetricSeries(charts.metric_series);
    } else if (chartType === 'comparison_ranking' && charts.ranking_bar) {
      renderRankingBar(charts.ranking_bar);
    } else if (chartType === 'legal_risk') {
      renderLegalPlaceholder();
    }
    applySortable();
    setTimeout(function () {
      chartInstances.forEach(function (inst) {
        try {
          inst.resize();
        } catch (_) {}
      });
    }, 50);
  }

  function sendMsg() {
    const question = input.value.trim();
    if (!question) return;
    if (question.length < 3) {
      agentError.textContent = '问题至少需要 3 个字符';
      return;
    }
    agentError.textContent = '';
    agentStatus.textContent = '正在分析...';
    append('user', question);
    input.value = '';
    sendBtn.disabled = true;

    fetchJson('/api/v1/agent/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
      body: JSON.stringify({ question: question, session_id: currentSessionId || null }),
    })
      .then(function (result) {
        currentSessionId = result.session_id || currentSessionId;
        if (result.status === 'needs_clarification') {
          const qs = (result.clarification && result.clarification.questions) || [];
          append('bot', '需要补充信息后才能继续：\n' + qs.map(function (q, i) { return i + 1 + '. ' + q.question; }).join('\n'));
          chartPanel.classList.remove('show');
        } else {
          const report = result.report || {};
          append('bot', safeText(report.summary, '（无摘要）'));
          renderCharts(result.charts || {});
          if (!userCollapsedChartThisSession) {
            setChartCollapsed(false, false);
            chartPanel.classList.add('show');
          }
        }
        renderSources(result.evidence || []);
        agentStatus.textContent = '响应完成';
      })
      .catch(function (e) {
        append('sys', '执行失败：' + e.message);
        agentError.textContent = '执行失败：' + e.message;
        agentStatus.textContent = '';
        chartPanel.classList.remove('show');
      })
      .finally(function () {
        sendBtn.disabled = false;
      });
  }

  let isComposing = false;
  input.addEventListener('compositionstart', function () { isComposing = true; });
  input.addEventListener('compositionend', function () { isComposing = false; });

  sendBtn.addEventListener('click', sendMsg);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !isComposing) sendMsg();
  });

  newSessionBtn.addEventListener('click', function () {
    currentSessionId = '';
    sourcePanel.textContent = '暂无证据';
    btnEvidence.textContent = '证据';
    append('sys', '已新建会话（前端上下文已清空）。');
    agentStatus.textContent = '已新建会话，请输入新问题';
    agentError.textContent = '';
    chartPanel.classList.remove('show');
    destroyAllCharts();
    chartContent.innerHTML = '';
  });

  logoutBtn.addEventListener('click', function () {
    localStorage.removeItem('token');
    toLoginPage();
  });

  btnEvidence.addEventListener('click', function (e) {
    e.stopPropagation();
    evidencePanel.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!evidencePanel.contains(e.target) && e.target !== btnEvidence) evidencePanel.classList.remove('open');
  });
  refreshSourcesBtn.addEventListener('click', function () {
    agentError.textContent = '';
    if (!currentSessionId) {
      agentError.textContent = '暂无会话，无法加载证据';
      return;
    }
    fetchJson('/api/v1/agent/sources/' + currentSessionId, {
      headers: { Authorization: 'Bearer ' + getToken() },
    })
      .then(function (payload) {
        renderSources((payload && payload.sources) || []);
        agentStatus.textContent = '会话证据已刷新';
      })
      .catch(function (e) {
        agentError.textContent = '刷新证据失败：' + e.message;
      });
  });

  toggleChartBtn.addEventListener('click', function () {
    const collapsed = isChartCollapsed();
    if (collapsed) {
      setChartCollapsed(false, true);
      chartPanel.classList.add('show');
    } else {
      setChartCollapsed(true, true);
      chartPanel.classList.remove('show');
    }
  });
  collapseChartBtn.addEventListener('click', function () {
    const collapsed = isChartCollapsed();
    if (collapsed) {
      setChartCollapsed(false, true);
      chartPanel.classList.add('show');
    } else {
      setChartCollapsed(true, true);
      chartPanel.classList.remove('show');
    }
  });

  window.addEventListener('resize', function () {
    chartInstances.forEach(function (inst) {
      try {
        inst.resize();
      } catch (_) {}
    });
  });

  if (isChartCollapsed()) chartPanel.classList.remove('show');
  syncChartButtons();
  append('sys', '欢迎使用。你可连续追问，系统会复用当前会话上下文。');
})();
