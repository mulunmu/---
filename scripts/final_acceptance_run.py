from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import requests


API = "http://127.0.0.1:8002/api/v1/agent/query"


@dataclass
class CaseResult:
    case_id: int
    name: str
    ok: bool
    reason: str


def _post(question: str, session_id: str) -> tuple[int, dict[str, Any]]:
    r = requests.post(API, json={"question": question, "session_id": session_id, "force": True}, timeout=120)
    body = r.json()
    data = body.get("data") if isinstance(body, dict) and isinstance(body.get("data"), dict) else body
    return r.status_code, data


def _summary(data: dict[str, Any]) -> str:
    return str(((data.get("report") or {}).get("summary") or "")).strip()


def _chart_type(data: dict[str, Any]) -> str:
    return str(((data.get("charts") or {}).get("chart_type") or "")).strip()


def _contains_any(text: str, pats: list[str]) -> bool:
    return any(re.search(p, text, flags=re.IGNORECASE) for p in pats)


def run() -> int:
    out: list[CaseResult] = []

    # 1
    c, d = _post("比亚迪2022年销量", "acc-1")
    s = _summary(d)
    ok = c == 200 and _chart_type(d) == "simple_metric" and ("1,305,447" in s or "1305447" in s) and ("报告摘要" not in s)
    out.append(CaseResult(1, "比亚迪2022年销量", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, summary={s}"))

    # 2
    c, d = _post("长城汽车2022年净利润", "acc-2")
    s = _summary(d)
    ok = c == 200 and d.get("status") == "completed" and bool(re.search(r"\d", s))
    out.append(CaseResult(2, "长城汽车2022年净利润", ok, "" if ok else f"status={c}, payload_status={d.get('status')}, summary={s}"))

    # 3
    c, d = _post("中国重汽2022年营收", "acc-3")
    s = _summary(d)
    ok = c == 200 and d.get("status") == "completed" and bool(re.search(r"\d", s))
    out.append(CaseResult(3, "中国重汽2022年营收", ok, "" if ok else f"status={c}, payload_status={d.get('status')}, summary={s}"))

    # 4
    c, d = _post("分析比亚迪2022年的综合风险", "acc-4")
    ch = d.get("charts") or {}
    s = _summary(d)
    ok = (
        c == 200
        and _chart_type(d) == "analysis"
        and "LLM未返回有效内容" not in s
        and isinstance(ch.get("radar"), dict)
        and isinstance(ch.get("scatter"), dict)
        and isinstance(ch.get("gauge"), dict)
    )
    out.append(CaseResult(4, "分析比亚迪2022年的综合风险", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, has_radar={isinstance(ch.get('radar'),dict)}, has_scatter={isinstance(ch.get('scatter'),dict)}, has_gauge={isinstance(ch.get('gauge'),dict)}, summary={s}"))

    # 5
    c, d = _post("分析力帆科技2022年的综合风险", "acc-5")
    ch = d.get("charts") or {}
    s = _summary(d)
    ok = c == 200 and d.get("status") == "completed" and isinstance(ch.get("radar"), dict)
    out.append(CaseResult(5, "分析力帆科技2022年的综合风险", ok, "" if ok else f"status={c}, payload_status={d.get('status')}, chart={_chart_type(d)}, summary={s}"))

    # 6
    c, d = _post("对比长城汽车、长安汽车、广汽集团的财务和销售表现", "acc-6")
    s = _summary(d)
    rb = (d.get("charts") or {}).get("ranking_bar") or {}
    ok = c == 200 and _chart_type(d) == "comparison_ranking" and "第一值得投资的是" in s and "雷达图和散点图已展示" not in s and isinstance(rb.get("series"), list)
    out.append(CaseResult(6, "多企财务销售对比", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, has_ranking_bar={isinstance(rb.get('series'),list)}, summary={s}"))

    # 7
    c, d = _post("对比汉马科技和索菱股份的财务与司法风险", "acc-7")
    ch = d.get("charts") or {}
    s = _summary(d)
    ok = c == 200 and _chart_type(d) in {"comparison_ranking", "legal_risk"} and ("第一值得投资的是" in s) and isinstance(ch.get("stacked_bar") or {}, dict) and isinstance(ch.get("heatmap") or {}, dict)
    out.append(CaseResult(7, "财务+司法对比", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, has_stacked={isinstance(ch.get('stacked_bar'),dict)}, has_heatmap={isinstance(ch.get('heatmap'),dict)}, summary={s}"))

    # 8 (follow-up with same session)
    sid8 = "acc-8"
    _post("对比长城汽车、长安汽车、广汽集团的财务和销售表现", sid8)
    c, d = _post("为什么长安排名第一", sid8)
    s = _summary(d)
    ok = c == 200 and d.get("status") == "completed" and not _contains_any(s, [r"ROE", r"流动比率", r"速动比率", r"\d+\.\d+", r"证据ID", r"ev_"])
    out.append(CaseResult(8, "归因追问", ok, "" if ok else f"status={c}, payload_status={d.get('status')}, summary={s}"))

    # 9
    sid9 = "acc-9"
    _post("比亚迪2022年销量", sid9)
    c2, d2 = _post("长城呢", sid9)
    c3, d3 = _post("长安呢", sid9)
    s2, s3 = _summary(d2), _summary(d3)
    ok = c2 == 200 and c3 == 200 and ("2022" in s2 and "长城" in s2) and ("2022" in s3 and "长安" in s3)
    out.append(CaseResult(9, "上下文记忆链", ok, "" if ok else f"s2={s2}; s3={s3}"))

    # 10
    sid10 = "acc-10"
    _post("对比长城汽车和长安汽车", sid10)
    c, d = _post("它的司法风险呢", sid10)
    s = _summary(d)
    ok = c == 200 and d.get("status") == "completed" and ("长安" in s or "长安汽车" in s)
    out.append(CaseResult(10, "指代消解", ok, "" if ok else f"status={c}, summary={s}"))

    # 11
    sid11 = "acc-11"
    _post("中汽股份2022年销量", sid11)
    c, d = _post("为什么是0", sid11)
    s = _summary(d)
    ok = c == 200 and _contains_any(s, [r"口径", r"新能源销量", r"数据库中暂无记录", r"销量并非0"])
    out.append(CaseResult(11, "零值解释", ok, "" if ok else f"status={c}, summary={s}"))

    # 12
    sid12 = "acc-12"
    _post("分析比亚迪2022年综合风险", sid12)
    c, d = _post("这个分数算好的吗", sid12)
    s = _summary(d)
    ok = c == 200 and _contains_any(s, [r"评级", r"A", r"B", r"C", r"D", r"良好", r"可控", r"中等"])
    out.append(CaseResult(12, "情感评分解读", ok, "" if ok else f"status={c}, summary={s}"))

    # 13
    c, d = _post("22年销量最高的车企", "acc-13")
    s = _summary(d)
    ok = c == 200 and _chart_type(d) == "ranking" and ("第一名" in s or "销量最高" in s) and ("综合风险" not in s)
    out.append(CaseResult(13, "排行榜", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, summary={s}"))

    # 14
    c, d = _post("汉马科技最近的司法风险", "acc-14")
    ch = d.get("charts") or {}
    s = _summary(d)
    ok = c == 200 and _chart_type(d) == "legal_risk" and isinstance(ch.get("stacked_bar"), dict) and isinstance(ch.get("heatmap"), dict)
    out.append(CaseResult(14, "司法风险", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, has_stacked={isinstance(ch.get('stacked_bar'),dict)}, has_heatmap={isinstance(ch.get('heatmap'),dict)}, summary={s}"))

    # 15
    c, d = _post("一彬科技2022年销量", "acc-15")
    s = _summary(d)
    ok = c == 200 and _contains_any(s, [r"无销售数据", r"销售数据暂未收录", r"仅在财务领域"])
    out.append(CaseResult(15, "边界提示", ok, "" if ok else f"status={c}, summary={s}"))

    # 16
    c, d = _post("理想汽车的舆情怎么样", "acc-16")
    s = _summary(d)
    ok = c == 200 and _chart_type(d) == "sentiment" and (not _contains_any(s, [r"第一值得投资", r"推荐投资"]))
    out.append(CaseResult(16, "舆情查询", ok, "" if ok else f"status={c}, chart={_chart_type(d)}, summary={s}"))

    fail_count = 0
    for r in out:
        if r.ok:
            print(f"[PASS] {r.case_id:02d} {r.name}")
        else:
            fail_count += 1
            print(f"[FAIL] {r.case_id:02d} {r.name} -> {r.reason}")
    print(f"TOTAL={len(out)} PASS={len(out)-fail_count} FAIL={fail_count}")
    return 1 if fail_count else 0


if __name__ == "__main__":
    raise SystemExit(run())

