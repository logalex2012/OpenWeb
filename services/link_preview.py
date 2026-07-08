import html as html_lib
import hashlib
import ipaddress
import re
import socket
import ssl
from datetime import timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

from models.db import db
from models.models import LinkPreview, utcnow

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

CACHE_TTL = timedelta(hours=24)
FAILED_CACHE_TTL = timedelta(hours=1)
REQUEST_TIMEOUT = 5
MAX_BYTES = 1_000_000
MAX_URL_LENGTH = 2048
USER_AGENT = "Mozilla/5.0 (compatible; OpenWebLinkPreview/1.0)"

_META_PATTERNS = {
    "title": [
        r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']',
        r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:title["\']',
        r'<title[^>]*>(.*?)</title>',
    ],
    "description": [
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']',
        r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:description["\']',
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
    ],
    "image_url": [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']',
        r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:image["\']',
    ],
    "site_name": [
        r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\'](.*?)["\']',
    ],
}


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def _is_safe_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_multicast or ip.is_reserved or ip.is_unspecified
        ):
            return False
    return True


def _is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.hostname) and _is_safe_host(parsed.hostname)


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _is_safe_url(newurl):
            raise URLError(f"Unsafe redirect target: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_html(url: str) -> tuple[str, str]:
    opener = build_opener(_SafeRedirectHandler, HTTPSHandler(context=_SSL_CONTEXT))
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with opener.open(req, timeout=REQUEST_TIMEOUT) as resp:
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            raise ValueError("not html")
        raw = resp.read(MAX_BYTES)
        final_url = resp.geturl()

    charset_match = re.search(r"charset=([\w-]+)", content_type, re.IGNORECASE)
    charset = charset_match.group(1) if charset_match else "utf-8"
    try:
        decoded = raw.decode(charset, errors="ignore")
    except LookupError:
        decoded = raw.decode("utf-8", errors="ignore")
    return decoded, final_url


def _extract_meta(html_content: str, base_url: str) -> dict:
    def find(patterns):
        for pattern in patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                return html_lib.unescape(match.group(1).strip())
        return None

    image = find(_META_PATTERNS["image_url"])
    return {
        "title": find(_META_PATTERNS["title"]),
        "description": find(_META_PATTERNS["description"]),
        "image_url": urljoin(base_url, image) if image else None,
        "site_name": find(_META_PATTERNS["site_name"]),
    }


def _store(url_hash: str, url: str, *, status: str, title=None, description=None,
           image_url=None, site_name=None) -> LinkPreview:
    record = LinkPreview.query.filter_by(url_hash=url_hash).first()
    if not record:
        record = LinkPreview(url_hash=url_hash, url=url)
        db.session.add(record)
    record.status = status
    record.title = title
    record.description = description
    record.image_url = image_url
    record.site_name = site_name
    record.fetched_at = utcnow()
    db.session.commit()
    return record


def get_link_preview(url: str) -> dict | None:
    url = (url or "").strip()
    if not url or len(url) > MAX_URL_LENGTH:
        return None

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None

    url_hash = _hash_url(url)
    now = utcnow()
    cached = LinkPreview.query.filter_by(url_hash=url_hash).first()
    if cached and cached.fetched_at:
        fetched_at = cached.fetched_at
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        ttl = CACHE_TTL if cached.status == "ok" else FAILED_CACHE_TTL
        if now - fetched_at < ttl:
            return cached.to_dict() if cached.status == "ok" else None

    if not _is_safe_host(parsed.hostname):
        _store(url_hash, url, status="failed")
        return None

    try:
        html_content, final_url = _fetch_html(url)
    except (URLError, HTTPError, ValueError, OSError, TimeoutError):
        _store(url_hash, url, status="failed")
        return None

    meta = _extract_meta(html_content, final_url)
    if not any(meta.values()):
        _store(url_hash, url, status="failed")
        return None

    record = _store(
        url_hash,
        url,
        status="ok",
        title=(meta.get("title") or "")[:300] or None,
        description=(meta.get("description") or "")[:500] or None,
        image_url=meta.get("image_url"),
        site_name=meta.get("site_name") or parsed.hostname,
    )
    return record.to_dict()
