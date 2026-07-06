"""Normalização de dados ToonLivre → contrato AkiraScan."""
from __future__ import annotations

from typing import Any
from urllib.parse import quote


def proxy_url(url: str, prefix: str = "/api/catalogo") -> str:
    if not url:
        return ""
    if url.startswith("/"):
        return url
    return f"{prefix}/img?url={quote(url, safe='')}"


def normalize_manga(raw: dict[str, Any], api_prefix: str = "/api/catalogo") -> dict[str, Any]:
    manga_id = raw.get("id") or raw.get("uploadSlug") or raw.get("slug")
    cover = raw.get("coverUrl") or raw.get("cover") or raw.get("capa") or ""
    capa = proxy_url(cover, api_prefix) if cover else ""

    chapters_raw = raw.get("chapters") or raw.get("capitulos") or []
    capitulos = []
    for c in chapters_raw:
        capitulos.append({
            "id": c.get("id"),
            "numero": c.get("number") or c.get("numero") or c.get("chapterNumber") or 0,
            "titulo": c.get("title"),
            "paginas": c.get("pageCount") or c.get("page_count") or 0,
            "publicadoEm": c.get("publishedAt") or c.get("createdAt") or c.get("updatedAt"),
            "novo": c.get("isNew") or False,
        })
    capitulos.sort(key=lambda x: float(x["numero"] or 0), reverse=True)

    return {
        "id": manga_id,
        "titulo": raw.get("title") or raw.get("titulo") or manga_id,
        "sinopse": raw.get("description") or raw.get("sinopse") or "",
        "autor": raw.get("author") or raw.get("autor") or "",
        "artista": raw.get("artist") or raw.get("artista") or "",
        "generos": raw.get("genres") or raw.get("generos") or [],
        "status": "Completo" if raw.get("status") == "completed" else (raw.get("status") or "Em lançamento"),
        "capa": capa,
        "banner": capa,
        "popularidade": raw.get("views") or raw.get("popularity") or raw.get("rating") or 50,
        "capitulos": capitulos,
        "atualizadoEm": (capitulos[0]["publicadoEm"] if capitulos else None) or raw.get("updatedAt"),
        "origem": "toonlivre",
        "toonlivreId": manga_id,
    }


def validate_manga(m: dict[str, Any], expected_id: str | None = None) -> None:
    if not m or not isinstance(m, dict):
        raise ValueError("Estrutura de dados corrompida")
    if not m.get("id"):
        raise ValueError("ID ausente")
    if expected_id and m["id"] != expected_id:
        raise ValueError("ID inconsistente")
    if not m.get("titulo"):
        raise ValueError("Título ausente")
    if not isinstance(m.get("capitulos"), list):
        raise ValueError("Capítulos inválidos")
