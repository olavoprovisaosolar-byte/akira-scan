"""Cliente ToonLivre — API oficial via httpx."""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

BASE = os.getenv("TOONLIVRE_BASE_URL", "https://toonlivre.net")
TOKEN_HEADER = os.getenv("TOONLIVRE_TOKEN_HEADER", "x-tly-sec")
TOKEN_VALUE = os.getenv("TOONLIVRE_TOKEN_VALUE", "web-z99")

HEADERS = {
    "User-Agent": "AkiraScan-Sync/2.0 (+https://akirascan)",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "application/json,*/*",
    "Origin": BASE,
}

ASSET_RE = re.compile(r"/assets/index-[\w-]+\.js")
PAIR_RE = re.compile(r'"(x-t[a-z0-9-]+)"\s*[,:]\s*"(web-[a-z0-9]+)"')


class ToonLivreClient:
    def __init__(self) -> None:
        self._token: dict[str, str] | None = None

    async def _resolve_token(self, client: httpx.AsyncClient) -> dict[str, str]:
        if os.getenv("TOONLIVRE_TOKEN_VALUE") and os.getenv("TOONLIVRE_TOKEN_HEADER"):
            return {
                "header": os.environ["TOONLIVRE_TOKEN_HEADER"],
                "value": os.environ["TOONLIVRE_TOKEN_VALUE"],
            }
        if self._token:
            return self._token

        res = await client.get(f"{BASE}/", headers=HEADERS)
        if res.status_code < 400:
            match = ASSET_RE.search(res.text)
            if match:
                js = await client.get(f"{BASE}{match.group(0)}", headers=HEADERS)
                pair = PAIR_RE.search(js.text)
                if pair:
                    self._token = {"header": pair.group(1), "value": pair.group(2)}
                    return self._token

        self._token = {"header": TOKEN_HEADER, "value": TOKEN_VALUE}
        return self._token

    async def fetch(self, path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            token = await self._resolve_token(client)
            headers = {**HEADERS, "Referer": f"{BASE}/", token["header"]: token["value"]}
            api_key = os.getenv("TOONLIVRE_API_KEY")
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            res = await client.get(f"{BASE}{path}", headers=headers, params=params)
            res.raise_for_status()
            data = res.json()
            if isinstance(data, dict) and data.get("error"):
                raise RuntimeError(str(data["error"]))
            return data

    async def search(self, page: int = 1, limit: int = 48) -> dict[str, Any]:
        return await self.fetch(
            "/api/mangas/search",
            params={"page": page, "limit": limit, "sortBy": "popular", "sortOrder": "desc"},
        )

    async def manga_by_slug(self, slug: str) -> dict[str, Any]:
        return await self.fetch(f"/api/manga-by-slug/{slug}")
