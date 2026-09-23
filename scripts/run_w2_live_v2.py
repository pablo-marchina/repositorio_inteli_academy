#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import run_w2_live as w

w.PIPELINE_VERSION = "w2-live-v2"
w.DEDUP_VERSION = "dedup-live-v2"


def safe_dedup_score(a, b):
    if a["source_key"] == b["source_key"] and a.get("source_event_id") and a.get("source_event_id") == b.get("source_event_id"):
        return .999, "same_source_external_id", {"exact_external_id": 1.0}
    if a["official_url_n"] and a["official_url_n"] == b["official_url_n"]:
        if a["start_at"] and b["start_at"]:
            days = abs((a["start_at"] - b["start_at"]).total_seconds()) / 86400
            if days <= 14:
                return .999, "exact_official_url_compatible_date", {"exact_official_url": 1.0, "date_distance_days": round(days, 3)}
            if days <= 45:
                return .90, "reused_official_url_near_date", {"exact_official_url": 1.0, "date_distance_days": round(days, 3)}
            return .70, "reused_official_url_different_edition", {"exact_official_url": 1.0, "date_distance_days": round(days, 3)}
        return .90, "exact_official_url_missing_date", {"exact_official_url": 1.0}
    ts = w.title_sim(a["name"], b["name"])
    ds = w.date_sim(a["start_at"], b["start_at"])
    ls = w.loc_sim(a.get("city") or a.get("country"), b.get("city") or b.get("country"))
    if ts < .72:
        return None, None, None
    if ds is not None and ds < .45 and ts < .94:
        return None, None, None
    feats = [("title_similarity", ts, .55), ("date_similarity", ds, .30), ("location_similarity", ls, .15)]
    avail = [x for x in feats if x[1] is not None]
    score = sum(v * weight for _, v, weight in avail) / sum(weight for _, _, weight in avail)
    reason = "title_date_block" if ds is not None else "high_title_similarity"
    return score, reason, {key: round(value, 6) if value is not None else None for key, value, _ in feats}


w.dedup_score = safe_dedup_score

if __name__ == "__main__":
    raise SystemExit(asyncio.run(w.main()))
