#!/usr/bin/env python3
"""
AkiraScan — Sync Worker (Python)
API oficial ToonLivre → data/catalogo.json

Uso:
  pip install -r sync/python/requirements.txt
  python sync/python/toonlivre_sync.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from client import ToonLivreClient  # noqa: E402
from normalizer import normalize_manga, validate_manga  # noqa: E402

load_dotenv(ROOT / "config" / "toonlivre.env")
load_dotenv(ROOT / ".env")

DATA = ROOT / "data"
LOG = ROOT / "logs" / "sync.log"
CATALOGO = DATA / "catalogo.json"
STATE = DATA / "sync-state.json"

MAX_PAGES = int(os.getenv("TOONLIVRE_SYNC_PAGES", "5"))
DETAIL_LIMIT = int(os.getenv("TOONLIVRE_SYNC_DETAIL", "80"))


def log(msg: str) -> None:
    line = f"[{datetime.now(timezone.utc).isoformat()}] [Python] {msg}"
    print(line)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"ultimoSync": None, "mangas": {}}


def save_state(state: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def merge_with_local(remoto: list[dict]) -> list[dict]:
    """Merge simples: remoto como base; local pode ser enriquecido via Node depois."""
    return sorted(remoto, key=lambda m: m.get("titulo", ""))


async def main() -> int:
    log("=== ToonLivre sync (Python) — início ===")
    client = ToonLivreClient()
    state = load_state()
    catalog: dict[str, dict] = {}

    for page in range(1, MAX_PAGES + 1):
        log(f"  Pesquisa página {page}/{MAX_PAGES}")
        data = await client.search(page=page)
        lista = data.get("mangas") or []
        if not lista:
            break
        for m in lista:
            slug = m.get("id") or m.get("uploadSlug")
            if slug and slug not in catalog:
                catalog[slug] = normalize_manga(m)
        if not (data.get("pagination") or {}).get("hasNextPage"):
            break
        await asyncio.sleep(0.35)

    log(f"  {len(catalog)} mangás na listagem — detalhes...")
    detalhes = 0
    for slug in list(catalog.keys()):
        if detalhes >= DETAIL_LIMIT:
            break
        try:
            full = await client.manga_by_slug(slug)
            norm = normalize_manga({**catalog[slug], **full})
            validate_manga(norm, slug)
            catalog[slug] = norm

            prev = state["mangas"].get(slug, {})
            ult = norm["capitulos"][0] if norm["capitulos"] else None
            if ult and prev.get("ultimoCapId") != ult.get("id"):
                log(f"  NOVO capítulo: {norm['titulo']} — Cap. {ult.get('numero')}")

            state["mangas"][slug] = {
                "ultimoCapId": ult.get("id") if ult else None,
                "ultimoCapNum": ult.get("numero") if ult else None,
                "totalCaps": len(norm["capitulos"]),
                "atualizadoEm": norm.get("atualizadoEm"),
            }
            detalhes += 1
        except Exception as e:
            log(f"  ERRO detalhe {slug}: {e}")
        await asyncio.sleep(0.3)

    remoto = merge_with_local(list(catalog.values()))
    payload = {
        "fonte": "toonlivre+python",
        "atualizadoEm": datetime.now(timezone.utc).isoformat(),
        "total": len(remoto),
        "toonlivre": len(remoto),
        "mangas": remoto,
    }

    DATA.mkdir(parents=True, exist_ok=True)
    CATALOGO.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    state["ultimoSync"] = payload["atualizadoEm"]
    save_state(state)
    log(f"=== Concluído: {len(remoto)} mangás ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
