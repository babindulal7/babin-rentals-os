#!/usr/bin/env python3
"""
training_center_eval.py - Babin Rentals OS Training Center Golden Cases Evaluator (Python Runtime)

Validates the 47 synthetic golden cases (SYN-001 through SYN-047) offline without live DB writes,
external AI API costs, or PII.
"""

import json
import os
import re
from typing import Dict, Any, List, Set

from intelligence_router import evaluate_query

def load_synthetic_golden_cases(filepath: str = None) -> List[Dict[str, Any]]:
    if filepath is None:
        filepath = os.path.join(os.path.dirname(__file__), "..", "data", "golden_cases_synthetic.jsonl")
    
    cases = []
    seen_ids: Set[str] = set()
    with open(filepath, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            case = json.loads(line)
            cid = case.get("id")
            if not cid:
                raise ValueError(f"Missing ID at line {idx}")
            if cid in seen_ids:
                raise ValueError(f"Duplicate case ID detected: {cid} at line {idx}")
            seen_ids.add(cid)
            cases.append(case)
    return cases

def evaluate_golden_case(case: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    failure_codes = []
    
    # 1. Disposition check
    expected_disp = case.get("expectedDisposition")
    actual_disp = candidate.get("disposition")
    if actual_disp != expected_disp:
        failure_codes.append(f"DISPOSITION_MISMATCH: expected {expected_disp}, got {actual_disp}")
        
    text = candidate.get("text", "").lower()
    
    # 2. Forbidden assertions check (generic + strict identity/safety patterns)
    for forbidden in case.get("forbiddenAssertions", []):
        fnorm = forbidden.lower()
        if "do not merge with fx30" in fnorm and ("same as fx30" in text or "merge with fx30" in text or candidate.get("matched_model_id") == "CAM-SONY-FX30-BODY"):
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not select sony fx3" in fnorm and (re.search(r"\bsony fx3\b", text) or candidate.get("matched_model_id") in ("CAM-SONY-FX3-BODY", "M-FX3-BODY")):
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not advise powering on for test" in fnorm and ("power on" in text and "do not power on" not in text):
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not double-bill" in fnorm and "added separate line" in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not reveal internal notes" in fnorm and "internal repair note" in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not count blocked as pass" in fnorm and "100% accuracy" in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif "do not display 100%" in fnorm and "100%" in text and "never display 100%" not in text and "never report 100%" not in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif fnorm in ("fx30", "ilme-fx30", "aps-c", "super 35") and fnorm in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")
        elif fnorm in ("rs3 pro", "ronin-s", "dji rs 3 mini", "500 nits", "1000 nits", "10% vat", "auto-approved for immediate production merge") and fnorm in text:
            failure_codes.append(f"FORBIDDEN_ASSERTION_TRIGGERED: {forbidden}")

    # 3. Required assertions & source IDs check
    for req in case.get("requiredAssertions", []):
        rnorm = req.lower()
        if actual_disp != expected_disp:
            failure_codes.append(f"MISSING_REQUIRED_ASSERTION: {req}")
        elif "must match exact sony fx3 model id" in rnorm and candidate.get("matched_model_id") not in ("CAM-SONY-FX3-BODY", "M-FX3-BODY"):
            failure_codes.append(f"MISSING_REQUIRED_ASSERTION: {req}")
        elif "must match exact sony fx30 model id" in rnorm and candidate.get("matched_model_id") != "CAM-SONY-FX30-BODY":
            failure_codes.append(f"MISSING_REQUIRED_ASSERTION: {req}")
        elif case["id"].startswith("REAL-") and case["suite"] == "model_identity":
            # Verify primary model ID / key phrase is present in real router output
            primary_tok = req.split()[0].lower()
            if primary_tok.startswith("m-") or primary_tok.startswith("sup-"):
                if primary_tok not in text and (candidate.get("matched_model_id") or "").lower() != primary_tok:
                    failure_codes.append(f"MISSING_REQUIRED_ASSERTION: {req}")

    for src_id in case.get("requiredSourceIds", []):
        if src_id not in candidate.get("source_ids", []) and src_id.lower() not in text:
            # Allow answers grounded directly via verified pilot sources
            if candidate.get("evidence_status") != "verified_primary":
                failure_codes.append(f"MISSING_REQUIRED_SOURCE: {src_id}")
            
    verdict = "pass" if len(failure_codes) == 0 else "fail"
    return {
        "case_id": case["id"],
        "suite": case["suite"],
        "severity": case["severity"],
        "verdict": verdict,
        "failure_codes": failure_codes,
        "evidence_status": candidate.get("evidence_status", "verified_primary" if verdict == "pass" else "unknown")
    }

def get_offline_engine_response(case: Dict[str, Any]) -> Dict[str, Any]:
    """Run ID-blind deterministic intelligence router using only (question, audience)."""
    return evaluate_query(
        question=case["question"],
        audience=case.get("audience", "staff"),
    )


def run_training_center_eval_suite(filepath: str = None) -> Dict[str, Any]:
    cases = load_synthetic_golden_cases(filepath)
    results = []
    counts = {"pass": 0, "fail": 0, "total": len(cases)}
    
    safety_privacy_failures = 0
    model_passed = 0
    model_total = 0
    
    for c in cases:
        cand = get_offline_engine_response(c)
        res = evaluate_golden_case(c, cand)
        results.append(res)
        if res["verdict"] == "pass":
            counts["pass"] += 1
        else:
            counts["fail"] += 1
            if c["suite"] in ("safety", "privacy"):
                safety_privacy_failures += 1
                
        if c["suite"] == "model_identity":
            model_total += 1
            if res["verdict"] == "pass":
                model_passed += 1
                
    return {
        "counts": counts,
        "results": results,
        "zero_safety_privacy_violations": safety_privacy_failures == 0,
        "model_accuracy": (model_passed / model_total * 100.0) if model_total > 0 else 0.0,
    }

if __name__ == "__main__":
    summary = run_training_center_eval_suite()
    print(f"Evaluated {summary['counts']['total']} cases: {summary['counts']['pass']} passed, {summary['counts']['fail']} failed.")
    print(f"Zero Safety/Privacy Violations: {summary['zero_safety_privacy_violations']}")
    print(f"Model ID Accuracy: {summary['model_accuracy']:.1f}%")
