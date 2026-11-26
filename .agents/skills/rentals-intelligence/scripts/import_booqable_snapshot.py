"""Create a privacy-safe, dated Booqable export snapshot for planning analysis.

The importer deliberately does not change catalog rates, availability, payments, or
approval status. Those are live operational facts and the CSV files are only a
historical export.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


# These links are intentionally explicit. An unmapped or package-level product
# must be reviewed by an owner; it is never inferred from a name fragment.
CATALOG_MAPPINGS: List[Dict[str, Any]] = [
    {"catalog_product_id": "BRPI-SONY-FX3A-BODY", "skus": ["CAM-FX3A-SON-KIT"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-RED-KOMODO-6K-BODY", "skus": ["CAM-KOMODO6K-RED"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-RED-KOMODOX-6K-BODY", "skus": ["CAM-KOMODOX-RED"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-DJI-RONIN4D-6K", "skus": ["CAM-R4D6K-DJI"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-SONY-A7SIII-BODY", "skus": ["CAM-A7S3-SON"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-SONY-A7IV-BODY", "skus": ["CAM-A7IV-SON"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-SONY-A7V-BODY", "skus": ["CAM-A7V-SON"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-CHIOPT-XTREME-ZOOM-SET", "skus": ["CHP-LNS-28-85MM", "CHP-LNS-75-250MM"], "match_status": "COMPOSITE_REVIEW", "note": "Export has two individual zoom SKUs; confirm package definition before use."},
    {"catalog_product_id": "BRPI-BLAZAR-MANTIS-SET", "skus": ["LEN-MANTIS-SET-BLZ"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-GREATJOY-ANAMORPHIC-SET", "skus": ["LEN-BLZ-GREATJOY-SET"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-NISI-ATHENA-SET", "skus": ["LEN-NISI-SET"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-SIGMA-24-70-ART-II", "skus": ["LEN-24-70-DGDN2-SIG"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-TAMRON-70-180", "skus": ["TAM-70-180-G2-SE"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-SONY-70-200", "skus": ["LEN-70-200-GM2-SON"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-DJI-RS4PRO", "skus": ["GMB-RS4P-DJI"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-DJI-RS3PRO", "skus": [], "match_status": "NO_MATCH", "note": "No confirmed matching SKU in this export."},
    {"catalog_product_id": "BRPI-DJI-RS3", "skus": ["GMB-RS3-DJI"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-ACCSOON-M7", "skus": ["MON-M7PRO-ACC"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-ACCSOON-CINEVIEW", "skus": ["VID-TX-RX-CVSDI2-ACC"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-AMARAN-300C", "skus": ["LGT-AM300C"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-AMARAN-200D", "skus": ["LGT-AM200D"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-APUTURE-600X-PRO", "skus": ["LGT-600X-APU"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-APUTURE-400X", "skus": ["APUTURE-400X"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-VMOUNT-99WH", "skus": ["BAT-VN99"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-DJI-MIC", "skus": [], "match_status": "NO_MATCH", "note": "Only DJI Mic Mini was confirmed in this export."},
    {"catalog_product_id": "BRPI-DJI-MIC-MINI", "skus": ["AUD-MICMINI-DJI"], "match_status": "EXACT"},
    {"catalog_product_id": "BRPI-TRIPOD-STANDARD", "skus": [], "match_status": "MANUAL_REVIEW", "note": "Several tripod SKUs exist; no generic rate match is safe."},
    {"catalog_product_id": "BRPI-STUDIO-ASSIST-TRIPOD", "skus": ["TRI-75-SA"], "match_status": "EXACT"},
]


def read_csv(path: Path) -> List[Dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def as_int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summarize_products(rows: Iterable[Dict[str, str]]) -> tuple[Dict[str, Any], Dict[str, List[Dict[str, str]]]]:
    rows = list(rows)
    by_sku: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("sku"):
            by_sku[row["sku"]].append(row)

    return {
        "export_row_count": len(rows),
        "distinct_sku_count": len(by_sku),
        "priced_row_count": sum(as_int(row.get("base_price_in_cents")) > 0 for row in rows),
        "available_unit_count": sum(as_int(row.get("available")) for row in rows),
        "status_counts": dict(sorted(Counter(row.get("status") or "UNSPECIFIED" for row in rows).items())),
    }, by_sku


def summarize_orders(rows: Iterable[Dict[str, str]]) -> Dict[str, Any]:
    rows = list(rows)
    return {
        "export_row_count": len(rows),
        "status_counts": dict(sorted(Counter(row.get("status") or "UNSPECIFIED" for row in rows).items())),
        "payment_status_counts": dict(sorted(Counter(row.get("payment_status") or "UNSPECIFIED" for row in rows).items())),
        "order_balance_due_paisa": sum(as_int(row.get("amount_to_be_paid_in_cents")) for row in rows),
        "active_or_reserved_order_count": sum(row.get("status") in {"Started", "Reserved"} for row in rows),
    }


def summarize_customers(rows: Iterable[Dict[str, str]]) -> Dict[str, Any]:
    balances = [as_int(row.get("balance_due_in_cents")) for row in rows]
    return {
        "export_row_count": len(balances),
        "customer_balance_due_paisa": sum(balances),
        "customers_with_balance_due": sum(balance > 0 for balance in balances),
        "largest_customer_balance_due_paisa": max(balances, default=0),
        "pii_retained": False,
    }


def catalog_rates() -> Dict[str, int]:
    with (DATA_DIR / "rental_catalog.json").open(encoding="utf-8") as handle:
        return {product["id"]: product["daily_rate_paisa"] for product in json.load(handle)["products"]}


def mapped_products(by_sku: Dict[str, List[Dict[str, str]]]) -> List[Dict[str, Any]]:
    rates = catalog_rates()
    result = []
    for mapping in CATALOG_MAPPINGS:
        sku_evidence = []
        for sku in mapping["skus"]:
            rows = by_sku.get(sku, [])
            observed_rates = sorted({as_int(row.get("base_price_in_cents")) for row in rows})
            sku_evidence.append({
                "sku": sku,
                "observed_names": sorted({row.get("name", "") for row in rows}),
                "observed_daily_rates_paisa": observed_rates,
                "export_row_count": len(rows),
            })
        record = {
            "catalog_product_id": mapping["catalog_product_id"],
            "match_status": mapping["match_status"],
            "catalog_planning_daily_rate_paisa": rates[mapping["catalog_product_id"]],
            "booqable_sku_evidence": sku_evidence,
        }
        if mapping.get("note"):
            record["note"] = mapping["note"]
        if mapping["match_status"] == "EXACT" and sku_evidence and len(sku_evidence[0]["observed_daily_rates_paisa"]) == 1:
            observed = sku_evidence[0]["observed_daily_rates_paisa"][0]
            record["booqable_snapshot_daily_rate_paisa"] = observed
            record["rate_difference_paisa"] = observed - record["catalog_planning_daily_rate_paisa"]
        result.append(record)
    return result


def owner_review_queue(mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Expose decisions without applying snapshot values to the rate card."""
    rate_change_candidates = [
        {
            "catalog_product_id": record["catalog_product_id"],
            "catalog_planning_daily_rate_paisa": record["catalog_planning_daily_rate_paisa"],
            "booqable_snapshot_daily_rate_paisa": record["booqable_snapshot_daily_rate_paisa"],
            "rate_difference_paisa": record["rate_difference_paisa"],
            "required_decision": "APPROVE_CURRENT_RATE | KEEP_PLANNING_RATE | REPLACE_WITH_NEW_RATE_CARD",
        }
        for record in mappings
        if record.get("rate_difference_paisa", 0) != 0
    ]
    mapping_reviews = [
        {
            "catalog_product_id": record["catalog_product_id"],
            "match_status": record["match_status"],
            "note": record.get("note", "Review before using this export evidence."),
            "required_decision": "CONFIRM_MAPPING | EXCLUDE_FROM_CATALOG",
        }
        for record in mappings
        if record["match_status"] != "EXACT"
    ]
    return {
        "status": "PENDING_OWNER_DECISION",
        "approval_gate": "No catalog rate, quote status, availability, balance, or approval state may be changed from this snapshot.",
        "rate_change_candidates": rate_change_candidates,
        "catalog_mapping_reviews": mapping_reviews,
    }


def build_snapshot(products_path: Path, orders_path: Path, customers_path: Path, as_of: str) -> Dict[str, Any]:
    product_rows = read_csv(products_path)
    order_rows = read_csv(orders_path)
    customer_rows = read_csv(customers_path)
    product_summary, by_sku = summarize_products(product_rows)
    mappings = mapped_products(by_sku)
    return {
        "snapshot_version": "1.0.0",
        "snapshot_id": f"booqable-export-{as_of}",
        "data_as_of": as_of,
        "usage_mode": "HISTORICAL_ANALYSIS",
        "live_operational_data": False,
        "operational_constraint": "This dated export cannot confirm current availability, account balances, payment approvals, or owner approvals. It must not set a client-final quote or alter catalog planning rates.",
        "privacy": "Aggregated operational counts and catalog-SKU evidence only; client names, emails, addresses, phones, and identifiers are excluded.",
        "source_exports": [
            {"filename": products_path.name, "sha256": file_digest(products_path)},
            {"filename": orders_path.name, "sha256": file_digest(orders_path)},
            {"filename": customers_path.name, "sha256": file_digest(customers_path)},
        ],
        "product_summary": product_summary,
        "order_summary": summarize_orders(order_rows),
        "customer_summary": summarize_customers(customer_rows),
        "catalog_mappings": mappings,
        "owner_review_queue": owner_review_queue(mappings),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a non-live, PII-free Booqable snapshot.")
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--orders", type=Path, required=True)
    parser.add_argument("--customers", type=Path, required=True)
    parser.add_argument("--as-of", required=True, help="Export date in YYYY-MM-DD format.")
    parser.add_argument("--output", type=Path, help="Optional destination; defaults to data/booqable_snapshot_<as-of>.json.")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    try:
        datetime.strptime(args.as_of, "%Y-%m-%d")
    except ValueError as error:
        parser.error(f"--as-of must use YYYY-MM-DD: {error}")
    output = args.output or DATA_DIR / f"booqable_snapshot_{args.as_of}.json"
    if output.exists() and not args.overwrite:
        parser.error(f"Output already exists: {output}. Use --overwrite after review.")
    snapshot = build_snapshot(args.products, args.orders, args.customers, args.as_of)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote historical snapshot: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
