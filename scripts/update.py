#!/usr/bin/env python3
"""Refresh the instruments.

1. Re-read points and comment counts for every catalogued event.
2. Search Hacker News for new "Hacker X" posts since the last run and add them,
   marked unreviewed, with a fault guessed from the title.

Standard library only; runs in CI every six hours. Data comes from the
HN Search API by Algolia (https://hn.algolia.com/api).
"""
import datetime
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "events.json"
PAGE = ROOT / "index.html"
API = "https://hn.algolia.com/api/v1/"

QUERIES = ["hacker", "HN", "hacker news", "but for", "recommended", "mentioned", "metahacker"]

PREFIX = re.compile(r"^(show|ask|tell|launch) hn\s*:\s*", re.I)
CAMEL = re.compile(r"\b(Hacker|HN)[A-Z][a-z]+")  # HackerTube, HackerZon, HNMovies
NOT_CAMEL = re.compile(r"\bHacker(One|Rank|Noon|Earth|Space|Spaces|Ranks?)\b")
PATTERNS = [
    re.compile(r"(hacker\s?news|\bhn\b)[^.]*\bbut (for|as|in|on)\b", re.I),
    re.compile(r"\bbut for\b[^.]*(hacker\s?news|\bhn\b)", re.I),
    re.compile(r"(recommended|mentioned|shared|linked|loved|discussed) (by|on|in|across) (hn|hacker\s?news)", re.I),
    re.compile(r"(version of|inspired by|à la|in the style of)[^.]*hacker\s?news|hacker\s?news[^.]*(à la|in the style of)", re.I),
    re.compile(r"(^|\b(a|an|the) )(hacker\s?news|hn) for\b", re.I),
    re.compile(r"(hacker\s?news|\bhn\b)('s)? (keeps|most|links|loves|favou?rite|recommends|aggregat)", re.I),
    re.compile(r"(extracted|mined|built|distilled|filtered|curated) from [^.]*(\bhn\b|hacker\s?news)", re.I),
    re.compile(r"\b(tiktok|youtube|netflix|spotify|goodreads|trends|perplexity) for (hacker\s?news|hn)\b", re.I),
    re.compile(r"\bx,? but for y\b|metahacker", re.I),
]
# This survey's own Show HN: the page renders it as "you are here".
SELF = re.compile(r"metahacker", re.I)
SELF_EVENT = {
    "fault": "ouroboros", "short": "metahacker", "role": "self", "reviewed": True,
    "felt": "This page. A seismological survey of the Hacker-X fault, published on the fault. Recursion depth 3.",
}

FAULTS = [
    ("ouroboros", re.compile(r"aggregat|metahacker|for (hn|hacker\s?news) (posts|comments)|hacker\s?news for hacker", re.I)),
    ("reskin", re.compile(r"(tiktok|trends|perplexity|tweets?|à la|style|inspired|version of)", re.I)),
    ("mentioned-on", re.compile(r"recommend|mention|shared|from .*(hn|hacker\s?news)|hacker\w+,? but for", re.I)),
    ("but-for", re.compile(r"(hacker\s?news|\bhn\b),? (but )?for\b", re.I)),
]


def get(endpoint, **params):
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as err:  # flaky network in CI: back off and retry
            if attempt == 3:
                raise
            print(f"retrying {endpoint}: {err}", file=sys.stderr)
            time.sleep(2 ** attempt)


def refresh(events):
    by_id = {e["id"]: e for e in events if e.get("id")}
    ids = list(by_id)
    for i in range(0, len(ids), 40):
        tags = "(" + ",".join("story_" + x for x in ids[i:i + 40]) + ")"
        for hit in get("search", tags=tags, hitsPerPage=100)["hits"]:
            e = by_id.get(hit["objectID"])
            if e:
                e["points"] = hit.get("points")
                e["comments"] = hit.get("num_comments")


def is_hacker_x(title):
    bare = PREFIX.sub("", title)
    if CAMEL.search(bare) and not NOT_CAMEL.search(bare):
        return True
    return any(p.search(bare) for p in PATTERNS)


def guess_fault(hit):
    title = PREFIX.sub("", hit["title"])
    if "news.ycombinator.com" in (hit.get("url") or ""):
        return "ouroboros"
    for fault, pattern in FAULTS:
        if pattern.search(title):
            return fault
    return "mentioned-on"


def detect(data, since):
    known = {e["id"] for e in data["events"] if e.get("id")} | set(data.get("ignore", []))
    known_urls = {e["url"].rstrip("/") for e in data["events"] if e.get("url")}
    known_titles = {e["title"].lower() for e in data["events"]}
    found = {}
    for query in QUERIES:
        for page in range(5):
            res = get("search_by_date", query=query, tags="story", hitsPerPage=1000, page=page,
                      numericFilters=f"created_at_i>{since}")
            for hit in res["hits"]:
                oid, title = hit["objectID"], hit.get("title") or ""
                if oid in known or oid in found or not is_hacker_x(title):
                    continue
                if (hit.get("url") or "").rstrip("/") in known_urls or title.lower() in known_titles:
                    continue
                found[oid] = {
                    "id": oid, "t": hit["created_at_i"], "title": title, "url": hit.get("url"),
                    "points": hit.get("points"), "comments": hit.get("num_comments"),
                    "fault": guess_fault(hit), "short": None,
                    "felt": "Detected by the instruments. Not yet reviewed by a seismologist.",
                    "reviewed": False,
                }
                if SELF.search(f"{title} {hit.get('url') or ''}") and not any(e.get("role") == "self" for e in data["events"]):
                    found[oid].update(SELF_EVENT)
            if page + 1 >= res.get("nbPages", 0):
                break
    return list(found.values())


def stamp_page(data):
    """Keep the numbers the page shows before its script runs in step with the data."""
    events = data["events"]
    main_t = next(e["t"] for e in events if e.get("id") == data["mainshock"])
    values = {
        "aftershocks": sum(e["t"] > main_t for e in events),
        "events-total": len(events) + (0 if any(e.get("role") == "self" for e in events) else 1),
        "events-instrumental": sum(e.get("points") is not None for e in events),
    }
    html = PAGE.read_text()
    for key, value in values.items():
        html = re.sub(rf'(data-bind="{key}">)\d+(<)', rf"\g<1>{value}\g<2>", html)
    PAGE.write_text(html)


def main():
    data = json.loads(DATA.read_text())
    now = int(time.time())
    since = data.get("checked_until", now - 86400) - 6 * 3600  # overlap: late indexing
    refresh(data["events"])
    new = detect(data, since)
    data["events"].extend(new)
    data["events"].sort(key=lambda e: e["t"])
    data["checked_until"] = now
    data["updated"] = datetime.datetime.fromtimestamp(now, datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    DATA.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    stamp_page(data)
    print(f"{len(data['events'])} events, {len(new)} new")
    for e in new:
        print(f"  + [{e['fault']}] {e['title']}")


if __name__ == "__main__":
    main()
