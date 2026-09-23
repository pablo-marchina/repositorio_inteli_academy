#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import os
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

SOURCES = {
    "hackclub_hackathons": {
        "url": "https://dash.hackathons.hackclub.com/api/v1/hackathons",
        "hosts": {"dash.hackathons.hackclub.com"},
    },
    "hackclub_programs": {
        "url": "https://hackclub.com/api/v1/events",
        "hosts": {"hackclub.com"},
    },
    "hackclub_community_events": {
        "url": "https://events.hackclub.com/api/events/upcoming",
        "hosts": {"events.hackclub.com"},
    },
    "agenda_tech_brasil": {
        "url": "https://api.github.com/repos/agenda-tech-brasil/agenda-tech-brasil/contents/src/db/database.json",
        "hosts": {"api.github.com"},
    },
}

MONTHS_PT = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3,
    "abril": 4, "maio": 5, "junho": 6, "julho": 7,
    "agosto": 8, "setembro": 9, "outubro": 10,
    "novembro": 11, "dezembro": 12,
}


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def valid_url(value):
    return value.strip() if isinstance(value, str) and value.strip().startswith(("https://", "http://")) else None


def parse_hackclub_hackathons(payload, source_url):
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    out = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        location = row.get("location") if isinstance(row.get("location"), dict) else {}
        out.append({
            "source_event_id": str(row.get("id")) if row.get("id") is not None else None,
            "name": str(row["name"]),
            "source_url": source_url,
            "official_url": valid_url(row.get("website")),
            "starts_at_raw": row.get("starts_at"),
            "ends_at_raw": row.get("ends_at"),
            "format_raw": row.get("modality"),
            "city": location.get("city"),
            "state_region": location.get("province"),
            "country": location.get("country"),
            "country_code": location.get("country_code"),
            "metadata": {"logo_url": row.get("logo_url"), "banner_url": row.get("banner_url"), "apac": row.get("apac")},
        })
    links = payload.get("links") if isinstance(payload, dict) else None
    next_url = valid_url(links.get("next")) if isinstance(links, dict) else None
    return out, [next_url] if next_url else []


def parse_hackclub_programs(payload, source_url):
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    out = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        out.append({
            "source_event_id": str(row.get("id")) if row.get("id") is not None else None,
            "name": str(row["name"]),
            "source_url": source_url,
            "official_url": valid_url(row.get("url")),
            "starts_at_raw": row.get("startDate"),
            "ends_at_raw": row.get("endDate"),
            "format_raw": row.get("format"),
            "eligibility_raw": row.get("requirements"),
            "tags": [str(x) for x in row.get("projectTypes", []) if x],
            "metadata": {"slug": row.get("slug"), "status": row.get("status"), "announced_at": row.get("announcedAt"), "in_person": row.get("inPerson")},
        })
    return out, []


def parse_hackclub_community(payload, source_url):
    rows = payload.get("data", payload.get("events", [])) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return [], []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("title") or row.get("name")
        if not name:
            continue
        slug = row.get("slug")
        out.append({
            "source_event_id": str(row.get("id")) if row.get("id") is not None else None,
            "name": str(name),
            "source_url": source_url,
            "official_url": f"https://events.hackclub.com/{slug}" if slug else None,
            "starts_at_raw": row.get("start"),
            "ends_at_raw": row.get("end"),
            "tags": [str(x) for x in row.get("tags", []) if x],
            "metadata": {"leader": row.get("leader"), "ama": row.get("ama")},
        })
    return out, []


def parse_agenda(payload, source_url):
    if not isinstance(payload, dict) or not isinstance(payload.get("content"), str):
        return [], []
    content = payload["content"]
    if payload.get("encoding") == "base64":
        content = base64.b64decode(content).decode("utf-8")
    data = json.loads(content)
    out = []
    for year_block in data.get("eventos", []):
        if not isinstance(year_block, dict) or year_block.get("arquivado") is True:
            continue
        try:
            year = int(year_block["ano"])
        except (KeyError, TypeError, ValueError):
            continue
        for month_block in year_block.get("meses", []):
            if not isinstance(month_block, dict) or month_block.get("arquivado") is True:
                continue
            month_name = str(month_block.get("mes", "")).lower()
            month = MONTHS_PT.get(month_name)
            for event in month_block.get("eventos", []):
                if not isinstance(event, dict):
                    continue
                name = event.get("nome")
                website = valid_url(event.get("url"))
                if not name or not website:
                    continue
                days = [str(day).zfill(2) for day in event.get("data", []) if str(day).strip()]
                start = f"{year:04d}-{month:02d}-{days[0]}" if month and days else None
                end = f"{year:04d}-{month:02d}-{days[-1]}" if month and days else start
                out.append({
                    "source_event_id": None,
                    "name": str(name),
                    "source_url": source_url,
                    "official_url": website,
                    "starts_at_raw": start,
                    "ends_at_raw": end,
                    "format_raw": event.get("tipo"),
                    "city": event.get("cidade") or None,
                    "state_region": event.get("uf") or None,
                    "country": "Brazil",
                    "country_code": "BR",
                    "metadata": {"year": year, "month": month_name, "days": days},
                })
    return out, []


PARSERS = {
    "hackclub_hackathons": parse_hackclub_hackathons,
    "hackclub_programs": parse_hackclub_programs,
    "hackclub_community_events": parse_hackclub_community,
    "agenda_tech_brasil": parse_agenda,
}


class GateSink:
    def __init__(self, url: str, token: str):
        self.url = url
        self.client = httpx.AsyncClient(timeout=30.0, headers={"x-gate-token": token, "content-type": "application/json"})

    async def close(self):
        await self.client.aclose()

    async def _write(self, payload: dict):
        response = await self.client.post(self.url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(f"gate sink rejected write: {data}")
        return data.get("data")

    async def insert(self, table: str, row: dict):
        return await self._write({"op": "insert", "table": table, "row": row})

    async def patch(self, table: str, row_id: str, row: dict):
        return await self._write({"op": "patch", "table": table, "id": row_id, "row": row})


async def run_source(source_key: str, max_pages: int, sink: GateSink):
    spec = SOURCES[source_key]
    parser = PARSERS[source_key]
    run_id = str(uuid4())
    await sink.insert("crawl_runs", {"id": run_id, "source_key": source_key, "status": "RUNNING", "started_at": now_iso(), "stats": {}})
    queue = [spec["url"]]
    seen = set()
    errors = []
    fetched_pages = persisted_documents = persisted_refs = parsed_records = 0

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers={"User-Agent": "HackathonIntelligenceBot/0.1 (+data-quality-gate)"}) as client:
        while queue and fetched_pages < max_pages:
            url = queue.pop(0)
            if url in seen:
                continue
            seen.add(url)
            host = (urlsplit(url).hostname or "").lower()
            if host not in spec["hosts"]:
                errors.append(f"blocked host: {host}")
                continue
            attempt_id = str(uuid4())
            t0 = time.monotonic()
            fetched_at = now_iso()
            try:
                resp = await client.get(url)
                elapsed = int((time.monotonic() - t0) * 1000)
                await sink.insert("fetch_attempts", {
                    "id": attempt_id, "crawl_run_id": run_id, "source_key": source_key,
                    "requested_url": url, "final_url": str(resp.url), "status_code": resp.status_code,
                    "content_type": resp.headers.get("content-type"), "fetched_at": fetched_at,
                    "elapsed_ms": elapsed, "error": None,
                    "headers": {k.lower(): v for k, v in resp.headers.items() if k.lower() in {"content-type", "etag", "last-modified"}},
                })
                resp.raise_for_status()
                fetched_pages += 1
                raw_id = str(uuid4())
                body = resp.content
                try:
                    structured = resp.json()
                except Exception:
                    structured = None
                await sink.insert("raw_documents", {
                    "id": raw_id, "crawl_run_id": run_id, "fetch_attempt_id": attempt_id,
                    "source_key": source_key, "canonical_url": str(resp.url),
                    "content_hash": hashlib.sha256(body).hexdigest(),
                    "content_type": resp.headers.get("content-type"), "http_status": resp.status_code,
                    "fetched_at": now_iso(), "structured_data": structured,
                    "body_base64": base64.b64encode(body).decode("ascii"),
                })
                persisted_documents += 1
                records, discovered = parser(structured, str(resp.url))
                parsed_records += len(records)
                for record in records:
                    await sink.insert("source_event_refs", {
                        "id": str(uuid4()), "crawl_run_id": run_id, "raw_document_id": raw_id,
                        "source_key": source_key, "source_event_id": record.get("source_event_id"),
                        "source_url": record.get("source_url"), "official_url": record.get("official_url"),
                        "name": record["name"], "payload": record,
                    })
                    persisted_refs += 1
                for candidate in discovered:
                    if not candidate:
                        continue
                    chost = (urlsplit(candidate).hostname or "").lower()
                    if chost in spec["hosts"] and candidate not in seen and candidate not in queue:
                        queue.append(candidate)
            except Exception as exc:
                elapsed = int((time.monotonic() - t0) * 1000)
                errors.append(f"{url}: {type(exc).__name__}: {exc}")
                try:
                    await sink.insert("fetch_attempts", {
                        "id": attempt_id, "crawl_run_id": run_id, "source_key": source_key,
                        "requested_url": url, "final_url": None, "status_code": None,
                        "content_type": None, "fetched_at": fetched_at, "elapsed_ms": elapsed,
                        "error": f"{type(exc).__name__}: {exc}"[:2000], "headers": {},
                    })
                except Exception:
                    pass

    status = "FAILED" if errors and fetched_pages == 0 else ("PARTIAL" if errors else "SUCCEEDED")
    stats = {
        "fetched_count": fetched_pages, "parsed_count": parsed_records, "failed_count": len(errors),
        "persisted_documents": persisted_documents, "persisted_event_refs": persisted_refs,
    }
    await sink.patch("crawl_runs", run_id, {"source_key": source_key, "status": status, "finished_at": now_iso(), "stats": stats})
    result = {"source": source_key, "crawl_run_id": run_id, "status": status, **stats, "errors": errors}
    print(json.dumps(result, ensure_ascii=False))
    return result


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="append", dest="sources")
    parser.add_argument("--max-pages", type=int, default=5)
    args = parser.parse_args()
    selected = args.sources or list(SOURCES)
    unknown = set(selected) - set(SOURCES)
    if unknown:
        raise SystemExit(f"unknown source(s): {sorted(unknown)}")
    sink = GateSink(os.environ["GATE_WRITE_URL"], os.environ["GATE_TOKEN"])
    try:
        results = []
        for source in selected:
            results.append(await run_source(source, args.max_pages, sink))
    finally:
        await sink.close()
    ok = all(r["status"] == "SUCCEEDED" and r["persisted_documents"] > 0 and r["persisted_event_refs"] > 0 for r in results)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
