"""
Rebuild dim_enterprise + fact tables in PostgreSQL from cleaned CSVs.
Designed to run against the Docker PostgreSQL container.
"""
import asyncio
import os
from pathlib import Path

import asyncpg
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CLEANED = ROOT / "data" / "cleaned"


def _env(name: str, default: str | None = None) -> str:
    v = os.getenv(name)
    if v and v.strip():
        return v.strip()
    if default is not None:
        return default
    raise RuntimeError(f"Missing env var: {name}")


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+asyncpg://"):
        return "postgresql://" + dsn[len("postgresql+asyncpg://"):]
    return dsn


def _to_num(v):
    if pd.isna(v) or v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


async def main() -> None:
    dsn = _normalize_dsn(_env("DATABASE_URL", "postgresql://app_v2:app_v2@127.0.0.1:5432/app_v2"))

    print(f"[INFO] Reading CSVs from {CLEANED}...")
    ent_df = pd.read_csv(CLEANED / "enterprise_basic.csv", dtype=str).fillna("")
    fin_df = pd.read_csv(CLEANED / "financials.csv", dtype=str).fillna("")
    sales_df = pd.read_csv(CLEANED / "sales.csv", dtype=str).fillna("")
    legal_df = pd.read_csv(CLEANED / "legal.csv", dtype=str).fillna("")

    ent_df.columns = [c.strip() for c in ent_df.columns]
    fin_df.columns = [c.strip() for c in fin_df.columns]
    sales_df.columns = [c.strip() for c in sales_df.columns]
    legal_df.columns = [c.strip() for c in legal_df.columns]

    conn = await asyncpg.connect(dsn=dsn)
    try:
        async with conn.transaction():
            # 1) Create tables if not exist
            print("[INFO] Creating tables...")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS dim_enterprise (
                    enterprise_id TEXT PRIMARY KEY,
                    stock_code TEXT,
                    stock_name TEXT NOT NULL,
                    standard_name TEXT
                );
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS fact_financials (
                    id SERIAL PRIMARY KEY,
                    enterprise_id TEXT REFERENCES dim_enterprise(enterprise_id),
                    year INTEGER,
                    revenue DOUBLE PRECISION,
                    net_profit DOUBLE PRECISION,
                    total_assets DOUBLE PRECISION,
                    total_liabilities DOUBLE PRECISION,
                    operating_cash_flow DOUBLE PRECISION,
                    current_ratio DOUBLE PRECISION,
                    quick_ratio DOUBLE PRECISION,
                    debt_asset_ratio DOUBLE PRECISION,
                    roe DOUBLE PRECISION,
                    net_margin DOUBLE PRECISION,
                    rd_expense DOUBLE PRECISION,
                    time_id TEXT
                );
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS fact_sales (
                    sales_id TEXT,
                    enterprise_id TEXT REFERENCES dim_enterprise(enterprise_id),
                    year INTEGER,
                    total_sales_volume DOUBLE PRECISION,
                    total_production_volume DOUBLE PRECISION,
                    nev_sales_volume DOUBLE PRECISION,
                    nev_production_volume DOUBLE PRECISION,
                    time_id TEXT
                );
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS fact_legal (
                    id SERIAL PRIMARY KEY,
                    enterprise_id TEXT REFERENCES dim_enterprise(enterprise_id),
                    year INTEGER,
                    lawsuit_count INTEGER,
                    lawsuit_total_amount DOUBLE PRECISION,
                    time_id TEXT
                );
            """)
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS ux_fact_legal_enterprise_year
                ON fact_legal (enterprise_id, year);
            """)

            # 2) Clear old data
            print("[INFO] Clearing old data...")
            await conn.execute("DELETE FROM fact_financials")
            await conn.execute("DELETE FROM fact_sales")
            await conn.execute("DELETE FROM fact_legal")
            await conn.execute("DELETE FROM dim_enterprise")

            # 3) Build dim_enterprise from enterprise_basic
            print("[INFO] Building dim_enterprise...")
            dim_rows = []
            for i, row in ent_df.iterrows():
                stock_code = str(row.get("security_code", "")).strip()
                stock_name = str(row.get("security_short_name", "")).strip()
                if not stock_name:
                    continue
                dim_rows.append((str(i + 1), stock_code or "", stock_name))
            await conn.executemany(
                "INSERT INTO dim_enterprise (enterprise_id, stock_code, stock_name) VALUES ($1, $2, $3)",
                dim_rows,
            )

            # Load mapping
            rows = await conn.fetch("SELECT enterprise_id, stock_code, stock_name FROM dim_enterprise")
            by_code = {str(r["stock_code"]).strip(): str(r["enterprise_id"]) for r in rows if r["stock_code"]}
            by_name = {str(r["stock_name"]).strip(): str(r["enterprise_id"]) for r in rows}
            print(f"  -> {len(dim_rows)} enterprises")

            # 4) Import financials
            print("[INFO] Importing fact_financials...")
            fin_rows = []
            for _, row in fin_df.iterrows():
                code = str(row.get("stock_code", "")).strip()
                name = str(row.get("stock_name") or row.get("enterprise_name", "")).strip()
                year_raw = row.get("year", "")
                if not year_raw:
                    continue
                try:
                    year = int(float(year_raw))
                except (ValueError, TypeError):
                    continue
                eid = by_code.get(code) or by_name.get(name)
                if not eid:
                    continue
                fin_rows.append((
                    eid, year,
                    _to_num(row.get("revenue")),
                    _to_num(row.get("net_profit")),
                    _to_num(row.get("total_assets")),
                    _to_num(row.get("total_liabilities")),
                    _to_num(row.get("operating_cash_flow")),
                    _to_num(row.get("current_ratio")),
                    _to_num(row.get("quick_ratio")),
                    _to_num(row.get("debt_asset_ratio")),
                    _to_num(row.get("roe")),
                    _to_num(row.get("net_margin")),
                    _to_num(row.get("rd_expense")),
                    None,
                ))
            if fin_rows:
                await conn.executemany("""
                    INSERT INTO fact_financials
                    (enterprise_id, year, revenue, net_profit, total_assets, total_liabilities,
                     operating_cash_flow, current_ratio, quick_ratio, debt_asset_ratio,
                     roe, net_margin, rd_expense, time_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                """, fin_rows)
            print(f"  -> {len(fin_rows)} financial records")

            # 5) Import sales
            print("[INFO] Importing fact_sales...")
            sales_rows = []
            for _, row in sales_df.iterrows():
                name = str(row.get("stock_name") or row.get("enterprise_name", "")).strip()
                if name.startswith("UNMATCHED::"):
                    continue
                year_raw = row.get("year", "")
                if not year_raw:
                    continue
                try:
                    year = int(float(year_raw))
                except (ValueError, TypeError):
                    continue
                code = str(row.get("stock_code", "")).strip()
                eid = by_code.get(code) or by_name.get(name)
                if not eid:
                    continue
                sales_rows.append({
                    "eid": eid, "year": year,
                    "total_sales_volume": _to_num(row.get("total_sales_volume")),
                    "nev_sales_volume": _to_num(row.get("nev_sales_volume")),
                })

            if sales_rows:
                sdf = pd.DataFrame(sales_rows)
                sdf = sdf.groupby(["eid", "year"], as_index=False).agg(
                    total_sales_volume=("total_sales_volume", "sum"),
                    nev_sales_volume=("nev_sales_volume", "sum"),
                )
                rows_to_insert = []
                for _, r in sdf.iterrows():
                    rows_to_insert.append((
                        r["eid"], int(r["year"]),
                        _to_num(r["total_sales_volume"]),
                        _to_num(r["nev_sales_volume"]),
                    ))
                await conn.executemany(
                    "INSERT INTO fact_sales (enterprise_id, year, total_sales_volume, nev_sales_volume) VALUES ($1,$2,$3,$4)",
                    rows_to_insert,
                )
                print(f"  -> {len(rows_to_insert)} sales records (aggregated)")
            else:
                print("  -> 0 sales records")

            # 6) Import legal
            print("[INFO] Importing fact_legal...")
            legal_rows = []
            for _, row in legal_df.iterrows():
                code = str(row.get("stock_code") or row.get("security_code", "")).strip()
                name = str(row.get("stock_name") or row.get("enterprise_name", "")).strip()
                year_raw = row.get("year", "")
                if not year_raw:
                    continue
                try:
                    year = int(float(year_raw))
                except (ValueError, TypeError):
                    continue
                eid = by_code.get(code) or by_name.get(name)
                if not eid:
                    continue
                lc = row.get("lawsuit_count", "")
                legal_rows.append((
                    eid, year,
                    int(float(lc)) if lc and str(lc).strip() else None,
                    _to_num(row.get("lawsuit_total_amount")),
                ))
            if legal_rows:
                await conn.executemany(
                    "INSERT INTO fact_legal (enterprise_id, year, lawsuit_count, lawsuit_total_amount) VALUES ($1,$2,$3,$4)",
                    legal_rows,
                )
            print(f"  -> {len(legal_rows)} legal records")

        # Summary
        counts = {}
        for tbl in ["dim_enterprise", "fact_financials", "fact_sales", "fact_legal"]:
            counts[tbl] = await conn.fetchval(f"SELECT COUNT(*) FROM {tbl}")
        print("\n## rebuild complete")
        for tbl, cnt in counts.items():
            print(f"  {tbl}: {cnt}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
