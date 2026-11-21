/* global GalaxyBackground */
(function () {
  'use strict';

  (function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) window.location.replace('./login.html');
  })();

  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const currentUserEl = document.getElementById('currentUser');
  const btnEvidence = document.getElementById('btnEvidence');
  const evidencePanel = document.getElementById('evidencePanel');
  const sourcePanel = document.getElementById('sourcePanel');
  const refreshSourcesBtn = document.getElementById('refreshSourcesBtn');
  const agentStatus = document.getElementById('agentStatus');
  const agentError = document.getElementById('agentError');
  const chartPanel = document.getElementById('chartPanel');
  const toggleChartBtn = document.getElementById('toggleChartBtn');
  const collapseChartBtn = document.getElementById('collapseChartBtn');
  const flowHint = document.getElementById('flowHint');
  const flowHintText = document.getElementById('flowHintText');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const chatInputWrap = document.querySelector('.chat-input');

  let currentSessionId = '';
  const DEFAULT_TIME_RANGE = '近3年';
  let userCollapsedChartThisSession = false;
  let analysisStartTime = 0;
  /** 分析阶段最短停留（与坍缩 800ms 独立）：避免接口极快时用户看不到“分析中” */
  const MIN_ANALYZE_MS_BEFORE_COLLAPSE = 1000;
  let flowTimer = null;
  let flowStepIndex = 0;
  const FLOW_STEPS = [
    '总控Agent 正在拆解问题...',
    '分析师正在提取关键指标...',
    '证据分析师正在校验证据...',
    '决策分析师正在生成结论...',
  ];
  var C = window.ChartRenderer;
  var CHART_THEME = C.CHART_THEME;
  var escapeHtml = C.escapeHtml;
  var normalizeCharts = C.normalizeCharts;
  var renderNoDataPlaceholder = C.renderNoDataPlaceholder;
  var renderGauge = C.renderGauge;
  var renderSimpleBars = C.renderSimpleBars;
  var renderLineSummary = C.renderLineSummary;
  var renderRadarSummary = C.renderRadarSummary;
  var renderScatterChart = C.renderScatterChart;
  var renderWordcloud = C.renderWordcloud;
  var renderHeatmapChart = C.renderHeatmapChart;
  var renderStackedBarChart = C.renderStackedBarChart;
  var renderEChartsGauge = C.renderEChartsGauge;
  var renderEChartsScatter = C.renderEChartsScatter;
  var renderRadarChart = C.renderRadarChart;
  var renderBarChart = C.renderBarChart;
  var renderLineChart = C.renderLineChart;
  var renderStackedBar = C.renderStackedBar;
  var renderHeatmap = C.renderHeatmap;
  var renderCharts = C.renderCharts;
  var renderRankingBarChart = C.renderRankingBarChart;
  var renderMetricSeriesCard = C.renderMetricSeriesCard;
  var createChartCard = C.createChartCard;
  var resizeCardChart = C.resizeCardChart;
  var toggleCardFullscreen = C.toggleCardFullscreen;
  var getChartGrid = C.getChartGrid;
  var adjustChartLayout = C.adjustChartLayout;
  var lastRenderedChartState = null;
  var currentEvidence = [];
  let isSending = false;
  let activeRequestId = 0;

  const galaxy = (function () {
    try {
      if (!window.GalaxyBackground) return null;
      return window.GalaxyBackground.create();
    } catch (e) {
      append('sys', '背景渲染初始化失败：' + (e && e.message ? e.message : 'unknown'));
      return null;
    }
  })();

  // 若 three/galaxy 脚本未生效，给出明确提示，避免误以为“土星被隐藏”
  setTimeout(function () {
    try {
      if (!window.THREE) append('sys', '背景提示：THREE 未加载（请 Ctrl+F5 或检查网络/CDN）。');
      else if (!window.GalaxyBackground) append('sys', '背景提示：GalaxyBackground 未加载（galaxy.js 未执行）。');
      else if (!window.__GALAXY_READY__) append('sys', '背景提示：土星初始化未完成（可能被缓存旧脚本）。');
    } catch (_) {}
  }, 80);

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

  function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.top = '14px';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '99';
    toast.style.padding = '8px 14px';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '12px';
    toast.style.color = '#fff';
    toast.style.background = type === 'error' ? 'rgba(220,38,38,.9)' : 'rgba(30,64,175,.9)';
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 2200);
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

  function renderAnswerMessage(answer) {
    const intent = answer.intent_type || 'analysis';
    const map = { low: '低', medium: '中', high: '高', unknown: '未知' };
    if (intent === 'chat') return '助手回复：' + safeText(answer.user_facing_reply, safeText(answer.summary));
    const reasons =
      (answer.key_findings || [])
        .slice(0, 4)
        .map(function (x, i) {
          return i + 1 + '. ' + safeText(x);
        })
        .join('\n') || '-';
    if (intent === 'decision') {
      return [
        '结论：' + safeText(answer.final_decision, '谨慎观望'),
        '解释：' + safeText(answer.user_facing_reply, safeText(answer.summary)),
        '置信度：' + safeText(answer.decision_confidence, 'medium'),
        '核心依据：\n' + reasons,
      ].join('\n\n');
    }
    return [
      '结论：' + safeText(answer.summary),
      '解释：' + safeText(answer.user_facing_reply, safeText(answer.summary)),
      answer.risk_level && answer.risk_level !== 'unknown' ? '风险等级：' + (map[answer.risk_level] || answer.risk_level) : '',
      '核心依据：\n' + reasons,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function refreshSessionSources() {
    renderSources(currentEvidence);
    return Promise.resolve();
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
    if (!chartPanel) return;
    localStorage.setItem('chartPanelCollapsed', collapsed ? '1' : '0');
    if (byUser) userCollapsedChartThisSession = !!collapsed;
    if (collapsed) {
      chartPanel.classList.remove('show');
      if (galaxy) galaxy.playAppear();
    } else {
      if (byUser && galaxy) galaxy.hideForPanelOpen();
      chartPanel.classList.add('show');
    }
    syncChartButtons();
  }

  /**
   * 新一次分析前：若大屏已展开，必须先关闭，再让土星以 appear 出现，再进入分析中。
   * 在 POST 发出之前通过 callback 进入后续逻辑（含设置 analysisStartTime）。
   */
  function prepareForNewQuery(next) {
    if (typeof next !== 'function') return;
    if (chartPanel && chartPanel.classList.contains('show')) {
      chartPanel.classList.remove('show');
      localStorage.setItem('chartPanelCollapsed', '1');
      syncChartButtons();
      if (galaxy) {
        requestAnimationFrame(function () {
          galaxy.playAppear(function () {
            if (galaxy) galaxy.setAnalyzing();
            next();
          });
        });
      } else {
        next();
      }
      return;
    }
    if (galaxy) {
      if (galaxy.getAppState && galaxy.getAppState() === 'hidden') {
        galaxy.playAppear(function () {
          if (galaxy) galaxy.setAnalyzing();
          next();
        });
        return;
      }
      galaxy.setAnalyzing();
    }
    next();
  }

  function schedulePanelReveal(requestId) {
    var wait = Math.max(0, MIN_ANALYZE_MS_BEFORE_COLLAPSE - (Date.now() - analysisStartTime));
    setTimeout(function () {
      if (requestId !== activeRequestId) return;
      function doReveal() {
        if (requestId !== activeRequestId) return;
        if (!userCollapsedChartThisSession) {
          setChartCollapsed(false, false);
        }
        adjustChartLayout();
      }
      if (!galaxy) {
        doReveal();
        return;
      }
      galaxy.playCollapse(function () {
        doReveal();
      });
    }, wait);
  }

  function handleAgentQueryResult(result, requestId) {
    if (requestId !== activeRequestId) return;
    currentSessionId = result.session_id || currentSessionId;

    if (result.status === 'needs_clarification') {
      playFlowHint('问题解析完成，等待补充信息...');
      const qs = (result.clarification && result.clarification.questions) || [];
      append(
        'bot',
        '需要补充信息后才能继续：\n' +
          qs
            .map(function (q, i) {
              return i + 1 + '. ' + q.question;
            })
            .join('\n')
      );
      finishFlowProgress('需补充信息').catch(function () {});
      if (chartPanel) {
        chartPanel.classList.remove('show');
      }
      localStorage.setItem('chartPanelCollapsed', '1');
      syncChartButtons();
      if (galaxy) galaxy.setIdle();
      currentEvidence = result.evidence || [];
      renderSources(currentEvidence);
      agentStatus.textContent = '需补充信息';
      return;
    }

    if (result.status === 'completed') {
      if (downloadPdfBtn) {
        downloadPdfBtn.style.display = 'inline-block';
      } else {
        console.warn('downloadPdfBtn 不存在，跳过显示');
      }
      if (!result.report || Object.keys(result.report).length === 0) {
        if (agentError) agentError.textContent = '分析报告生成失败，请稍后重试或更换查询';
        append('sys', '分析报告生成失败：report 为空');
        if (galaxy) galaxy.setIdle();
        finishFlowProgress('分析完成').catch(function () {});
        currentEvidence = result.evidence || [];
        renderSources(currentEvidence);
        agentStatus.textContent = '响应完成';
        return;
      }
    }

    const answer = {};
    if ((result.evidence || []).length > 0) {
      playFlowHint('证据提取完成，正在生成结论...');
    } else {
      playFlowHint('正在整理分析结论...');
    }
    const sections = (result.report && result.report.sections) || {};
    const isFastPath = sections.mode === 'simple_metric_fast_path';
    if (isFastPath && result.charts) {
      const directMetricText = buildFastPathMetricText(result.charts);
      if (directMetricText) {
        append('bot', directMetricText);
      } else {
        // Fast-path can return empty metric series when source data is missing.
        // In that case we still need to show backend summary text to avoid "no response" perception.
        append('bot', safeText((result.report && result.report.summary) || '', '暂无可用数据。'));
      }
      renderCharts(result.charts, answer, metricDisplayName);
    } else {
      renderReportMessage(result);
    }
    if (!isFastPath) {
      finishLoading(answer, result.charts);
    }
    finishFlowProgress('分析完成').catch(function () {});
    schedulePanelReveal(requestId);
    currentEvidence = result.evidence || [];
    renderSources(currentEvidence);
    agentStatus.textContent = '响应完成';
  }

  function playFlowHint(text) {
    if (!flowHint || !flowHintText) return;
    flowHint.classList.remove('fade-out');
    flowHint.classList.add('show');
    flowHintText.textContent = text;
    flowHintText.classList.remove('flash');
    void flowHintText.offsetWidth;
    flowHintText.classList.add('flash');
  }

  function startFlowProgress() {
    if (!flowHint || !flowHintText) return;
    stopFlowProgressInstant();
    flowStepIndex = 0;
    playFlowHint(FLOW_STEPS[flowStepIndex]);
    // 按真实请求生命周期单向前进，不循环，避免重复文字显得不专业。
    flowTimer = setTimeout(function () {
      flowStepIndex = 1;
      playFlowHint(FLOW_STEPS[flowStepIndex]);
      flowTimer = setTimeout(function () {
        flowStepIndex = 2;
        playFlowHint(FLOW_STEPS[flowStepIndex]);
        flowTimer = setTimeout(function () {
          flowStepIndex = 3;
          playFlowHint(FLOW_STEPS[flowStepIndex]);
        }, 1500);
      }, 1200);
    }, 800);
  }

  function stopFlowProgressInstant() {
    if (flowTimer) {
      clearInterval(flowTimer);
      clearTimeout(flowTimer);
      flowTimer = null;
    }
    if (!flowHint) return;
    flowHint.classList.remove('show');
    flowHint.classList.remove('fade-out');
  }

  function finishFlowProgress(finalText) {
    if (!flowHint || !flowHintText) return Promise.resolve();
    if (flowTimer) {
      clearInterval(flowTimer);
      clearTimeout(flowTimer);
      flowTimer = null;
    }
    playFlowHint(finalText || '分析完成');
    return new Promise(function (resolve) {
      setTimeout(function () {
        flowHint.classList.add('fade-out');
        setTimeout(function () {
          flowHint.classList.remove('show');
          flowHint.classList.remove('fade-out');
          resolve();
        }, 520);
      }, 420);
    });
  }

  // Chart rendering functions are now delegated to window.ChartRenderer (charts.js)

  let isComposing = false;
  input.addEventListener('compositionstart', function () {
    isComposing = true;
  });
  input.addEventListener('compositionend', function () {
    isComposing = false;
  });

  function extractStockCodeAndYear(question) {
    const yearMatch = String(question).match(/(20\d{2})/);
    const year = yearMatch ? Number(yearMatch[1]) : 2022;
    const map = {
      比亚迪: '比亚迪',
      宁德时代: '宁德时代',
      蔚来: '蔚来',
      上汽集团: '上汽集团',
      长城汽车: '长城汽车',
      特斯拉: '特斯拉',
    };
    let stockCode = '比亚迪';
    Object.keys(map).forEach(function (k) {
      if (question.indexOf(k) >= 0) stockCode = map[k];
    });
    return { stockCode: stockCode, year: year };
  }

  function renderScoringCard(scoring) {
    if (!scoring) return;
    const ds = scoring.dimension_scores || {};
    const lines = Object.keys(ds)
      .map(function (k) {
        return k + ': ' + ds[k];
      })
      .join('\n');
    append(
      'bot',
      [
        '评分结果',
        '企业：' + safeText(scoring.stock_name, scoring.stock_code),
        '年份：' + safeText(scoring.year),
        '总分：' + safeText(scoring.total_score),
        '评级：' + safeText(scoring.rating),
        '维度：\n' + (lines || '-'),
      ].join('\n')
    );
    renderCharts(
      {
        gauge: { value: Number(scoring.total_score) || 0 },
      },
      { key_findings: ['评级：' + safeText(scoring.rating)] },
      metricDisplayName
    );
  }

  function renderReportMessage(result) {
    const report = result.report || {};
    // Keep dialogue concise: only show final summary.
    append('bot', safeText(report.summary, '暂无摘要'));
  }

  function metricDisplayName(metric) {
    const m = String(metric || '').toLowerCase();
    const map = {
      sales_volume: '销量',
      revenue: '营收',
      net_profit: '净利润',
      total_assets: '总资产',
      roe: 'ROE',
    };
    return map[m] || safeText(metric, '指标');
  }

  function metricDisplayUnit(metric) {
    const m = String(metric || '').toLowerCase();
    if (m === 'sales_volume') return '辆';
    return '';
  }

  function buildFastPathMetricText(charts) {
    const ms = charts && charts.metric_series;
    if (!ms) return '';
    const categories = Array.isArray(ms.categories) ? ms.categories : [];
    const s0 = (ms.series && ms.series[0]) || {};
    const data = Array.isArray(s0.data) ? s0.data : [];
    const enterprise = safeText(ms.enterprise || s0.name, '该企业');
    const metric = metricDisplayName(ms.metric);
    const unit = metricDisplayUnit(ms.metric);
    const points = [];
    for (let i = 0; i < Math.min(categories.length, data.length); i += 1) {
      const v = data[i];
      if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
      points.push({ year: String(categories[i]), value: Number(v) });
    }
    if (!points.length) return '';
    if (points.length === 1) {
      return enterprise + points[0].year + '年' + metric + '为 ' + points[0].value.toLocaleString() + (unit ? ' ' + unit : '');
    }
    const start = points[0];
    const end = points[points.length - 1];
    const rising = end.value > start.value;
    const falling = end.value < start.value;
    const trend = rising ? '呈逐年上升趋势' : falling ? '呈下降趋势' : '整体较为平稳';
    return (
      enterprise +
      metric +
      '从' +
      start.year +
      '年的' +
      start.value.toLocaleString() +
      '变化到' +
      end.year +
      '年的' +
      end.value.toLocaleString() +
      (unit ? unit : '') +
      '，' +
      trend +
      '。'
    );
  }

  function sendMsg() {
    const question = input.value.trim();
    if (!question || isSending) return;
    if (question.length < 3) {
      agentError.textContent = '问题至少需要 3 个字符';
      return;
    }
    agentError.textContent = '';
    agentStatus.textContent = '正在分析...';
    append('user', question);
    input.value = '';
    sendBtn.disabled = true;
    isSending = true;
    const requestId = ++activeRequestId;
    startFlowProgress();

    prepareForNewQuery(function onReadyForRequest() {
      if (requestId !== activeRequestId) {
        sendBtn.disabled = false;
        isSending = false;
        return;
      }
      analysisStartTime = Date.now();
      var task;
      // “评分”关键词走轻量评分接口，其余问题走 Agent 主编排接口。
      if (question.indexOf('评分') >= 0) {
        const parsed = extractStockCodeAndYear(question);
        task = window.apiClient.getScoring(parsed.stockCode, parsed.year).then(function (scoring) {
          if (requestId !== activeRequestId) return;
          renderScoringCard(scoring);
          agentStatus.textContent = '评分完成';
          finishFlowProgress('分析完成').catch(function () {});
          schedulePanelReveal(requestId);
        });
      } else {
        task = window.apiClient.postAgentQuery(question, currentSessionId || null).then(function (result) {
          if (requestId !== activeRequestId) return;
          handleAgentQueryResult(result, requestId);
        });
      }

      task.catch(function (e) {
          finishFlowProgress('分析中断').catch(function () {});
          append('sys', '执行失败：' + e.message);
          agentError.textContent = '执行失败：' + e.message;
          showToast(e.message, 'error');
          agentStatus.textContent = '';
          if (chartPanel) {
            chartPanel.classList.remove('show');
          }
          localStorage.setItem('chartPanelCollapsed', '1');
          syncChartButtons();
          if (galaxy) galaxy.setIdle();
        })
        .finally(function () {
          sendBtn.disabled = false;
          isSending = false;
        });
    });
  }

  sendBtn.addEventListener('click', sendMsg);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !isComposing) sendMsg();
  });

  newSessionBtn.addEventListener('click', function () {
    stopFlowProgressInstant();
    currentSessionId = '';
    sourcePanel.textContent = '暂无证据';
    btnEvidence.textContent = '证据';
    append('sys', '已新建会话（前端上下文已清空）。');
    agentStatus.textContent = '已新建会话，请输入新问题';
    agentError.textContent = '';
    chartPanel.classList.remove('show');
    localStorage.setItem('chartPanelCollapsed', '1');
    syncChartButtons();
    if (galaxy) galaxy.setIdle();
  });

  logoutBtn.addEventListener('click', function () {
    window.apiClient.clearToken();
    window.location.href = './login.html';
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
    refreshSessionSources()
      .then(function () {
        agentStatus.textContent = '会话证据已刷新';
      })
      .catch(function (e) {
        agentError.textContent = '刷新证据失败：' + e.message;
      });
  });

  toggleChartBtn.addEventListener('click', function () {
    if (!chartPanel) return;
    setChartCollapsed(!isChartCollapsed(), true);
  });
  collapseChartBtn.addEventListener('click', function () {
    if (!chartPanel) return;
    setChartCollapsed(!isChartCollapsed(), true);
  });
  if (chartPanel) {
    chartPanel.addEventListener('dblclick', function (e) {
      if (e.target.closest('button, .chart-tools, .chart-head')) return;
      if (!chartPanel.classList.contains('show')) return;
      setChartCollapsed(true, true);
    });
  }

  if (localStorage.getItem('chartPanelCollapsed') === null) {
    localStorage.setItem('chartPanelCollapsed', '1');
  }
  if (chartPanel) {
    if (isChartCollapsed()) {
      chartPanel.classList.remove('show');
      if (galaxy) galaxy.setIdle();
    } else {
      chartPanel.classList.add('show');
      if (galaxy) galaxy.hideForPanelOpen();
    }
  }
  userCollapsedChartThisSession = false;
  syncChartButtons();
  function uploadFile(file) {
    if (!file) return;
    if (!agentStatus) {
      console.warn('agentStatus 不存在，跳过上传状态展示');
    }
    if (agentStatus) agentStatus.textContent = '文件上传中...';
    return window.apiClient
      .uploadFile(file, currentSessionId || null)
      .then(function (data) {
        currentSessionId = data.session_id || currentSessionId;
        const text = '已上传文件：' + (data.filename || file.name) + '，请告诉我你想分析的内容。';
        input.value = text;
        append('sys', text);
        if (agentStatus) agentStatus.textContent = '上传完成';
      })
      .catch(function (e) {
        if (agentError) agentError.textContent = '上传失败：' + e.message;
      });
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      uploadFile(f);
    });
  } else {
    console.warn('uploadBtn 或 fileInput 不存在，上传功能未挂载');
  }

  if (chatInputWrap) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      chatInputWrap.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        chatInputWrap.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      chatInputWrap.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        chatInputWrap.classList.remove('dragover');
      });
    });
    chatInputWrap.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      uploadFile(f);
    });
  } else {
    console.warn('chat-input 容器不存在，拖拽上传未挂载');
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', function () {
      if (!currentSessionId) return;
      window.open('/api/v1/report/download/' + encodeURIComponent(currentSessionId), '_blank');
    });
  } else {
    console.warn('downloadPdfBtn 不存在，PDF下载按钮未挂载');
  }

  // Keep chart rendering entrypoints request-driven (API response handlers only).

  function initMe() {
    window.apiClient
      .getMe()
      .then(function (me) {
        if (currentUserEl) currentUserEl.textContent = safeText(me.email, '已登录');
      })
      .catch(function () {
        window.apiClient.clearToken();
        window.location.replace('./login.html');
      });
  }
  window.addEventListener('offline', function () {
    showToast('网络已断开，请检查连接', 'error');
  });
  window.addEventListener('online', function () {
    showToast('网络已恢复', 'info');
  });
  window.addEventListener('resize', function () {
    adjustChartLayout();
  });
  window.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') {
      C.toggleCardFullscreen(null);
    }
  });
  initMe();
  append('sys', '欢迎使用，请直接输入企业问题。');
})();
