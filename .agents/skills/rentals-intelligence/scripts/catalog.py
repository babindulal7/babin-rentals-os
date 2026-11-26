"""Local catalog and data-freshness helpers for Rentals Intelligence."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_json(filename: str) -> Dict[str, Any]:
    path = DATA_DIR / filename
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def normalize_identifier(value: str) -> str:
    """Normalize an ID or alias for exact catalog matching."""
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


class RentalCatalog:
    def __init__(self, catalog: Dict[str, Any] | None = None) -> None:
        self.data = catalog or load_json("rental_catalog.json")
        self.products = {product["id"]: product for product in self.data["products"]}
        self.aliases: Dict[str, List[str]] = defaultdict(list)
        for product in self.products.values():
            for candidate in [product["id"], product["display_name"], *product.get("aliases", [])]:
                key = normalize_identifier(candidate)
                if product["id"] not in self.aliases[key]:
                    self.aliases[key].append(product["id"])

    def resolve(self, requested_id: Any) -> Dict[str, Any]:
        if not isinstance(requested_id, str) or not requested_id.strip():
            return {"status": "INVALID_IDENTIFIER", "error": "Each item needs a non-empty product_id."}

        matches = self.aliases.get(normalize_identifier(requested_id), [])
        if not matches:
            return {
                "status": "UNKNOWN_PRODUCT",
                "error": f"Unknown catalog item: '{requested_id}'. Use a BRPI product ID or a listed exact alias."
            }
        if len(matches) > 1:
            return {
                "status": "AMBIGUOUS_PRODUCT",
                "error": f"Ambiguous catalog item: '{requested_id}'. Use one of: {', '.join(matches)}.",
                "matches": matches,
            }
        return {"status": "RESOLVED", "product": self.products[matches[0]]}


def data_context(*filenames: str) -> Dict[str, Any]:
    manifest = load_json("data_manifest.json")
    files = manifest["files"]
    return {
        "live_operational_data_available": manifest["live_operational_data_available"],
        "operational_constraint": manifest["operational_constraint"],
        "sources": {
            filename: files[filename]
            for filename in filenames
            if filename in files
        },
    }
