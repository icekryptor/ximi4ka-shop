"""Build unique image URL list with pages where each appears.
Usage: python3 -I images.py <pages.json> <crawl_dir> <out.txt>
"""
import json
import re
import sys
from collections import defaultdict
from urllib.parse import urljoin, urlparse

BASE = "https://ximi4ka.ru"
SKIP_HOSTS = {"mc.yandex.ru", "top-fwz1.mail.ru"}
IMG = re.compile(r"""(?:src|href)=["']([^"']+)["']|(https?://[^\s"'<>]+\.(?:png|jpe?g|webp|gif|avif|svg))|(/uploads/[^\s"'<>\\)]+\.(?:png|jpe?g|webp|gif|avif|svg))""", re.I)


def rel(u):
    p = urlparse(u)
    return (p.path or "/") + (("?" + p.query) if p.query else "")


def canon(u):
    u = urljoin(BASE + "/", u.strip())
    p = urlparse(u)
    if p.netloc == "new.ximi4ka.ru":
        u = u.replace("://new.ximi4ka.ru", "://ximi4ka.ru", 1)
    return u


def main():
    pages_fn, crawl, out = sys.argv[1:4]
    pages = json.load(open(pages_fn, encoding="utf-8"))
    where = defaultdict(set)
    for p in pages:
        for im in p["images"]:
            if urlparse(im).netloc in SKIP_HOSTS:
                continue
            where[canon(im)].add(rel(p["url"]))
    raw = f"{crawl}/raw"

    def add_from_html(html, page):
        for m in IMG.finditer(html or ""):
            u = m.group(1) or m.group(2) or m.group(3)
            if not u or u.startswith("data:"):
                continue
            if not re.search(r"\.(png|jpe?g|webp|gif|avif|svg)(\?|$)", u, re.I):
                continue
            where[canon(u)].add(page)

    prods = json.load(open(f"{raw}/https___ximi4ka.ru_api_public_products_limit_1000", encoding="utf-8"))["data"]
    for pr in prods:
        page = f"/product/{pr['slug']}"
        for im in pr.get("images") or []:
            if im.get("url"):
                where[canon(im["url"])].add(page + " (API images)")
        if pr.get("ogImage"):
            where[canon(pr["ogImage"])].add(page + " (API ogImage)")
        add_from_html(json.dumps(pr.get("longDescriptionBlocks"), ensure_ascii=False).replace('\\"', '"'), page + " (API описание)")
    blog = json.load(open(f"{raw}/https___ximi4ka.ru_api_public_blog_limit_100", encoding="utf-8"))["data"]
    for b in blog:
        page = f"/blog/{b['slug']}"
        for k in ("coverImageUrl", "authorPhotoUrl", "ogImage"):
            if b.get(k):
                where[canon(b[k])].add(page + f" (API {k})")
        add_from_html(json.dumps(b.get("blocks"), ensure_ascii=False).replace('\\"', '"'), page + " (API текст)")
    cms = json.load(open(f"{raw}/https___ximi4ka.ru_api_public_pages_limit_200", encoding="utf-8"))["data"]
    for c in cms:
        page = f"/{c['slug']}"
        if c.get("ogImage"):
            where[canon(c["ogImage"])].add(page + " (API ogImage)")
        add_from_html(json.dumps(c.get("blocks"), ensure_ascii=False).replace('\\"', '"'), page + " (API CMS-блоки)")
    for fn, label in (("https___ximi4ka.ru_yml.xml", "/yml.xml"), ("https___ximi4ka.ru_turbo.xml", "/turbo.xml"), ("https___ximi4ka.ru_blog_rss.xml", "/blog/rss.xml")):
        x = open(f"{raw}/{fn}", encoding="utf-8", errors="replace").read()
        x = x.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")
        for m in re.finditer(r"<picture>(.*?)</picture>|<enclosure[^>]*url=\"([^\"]+)\"|src=\"([^\"]+)\"|<media:content[^>]*url=\"([^\"]+)\"", x):
            u = next(g for g in m.groups() if g)
            if re.search(r"\.(png|jpe?g|webp|gif|avif|svg)", u, re.I):
                where[canon(u)].add(label)
    # drop _next/image proxies (originals already decoded) and non-image junk
    rows = []
    for u, pg in where.items():
        if "/_next/image" in u or urlparse(u).netloc in SKIP_HOSTS:
            continue
        pages_sorted = sorted(pg, key=lambda s: (len(s), s))
        n = len({s.split(" ")[0] for s in pages_sorted})
        if n > 12:
            txt = f"на {n} стр. (сквозная): " + ", ".join(pages_sorted[:6]) + f" … и ещё {len(pages_sorted) - 6}"
        else:
            txt = ", ".join(pages_sorted)
        rows.append((u, txt))
    rows.sort()
    with open(out, "w", encoding="utf-8") as fh:
        for u, txt in rows:
            fh.write(f"{u}\t{txt}\n")
    print("images:", len(rows))


if __name__ == "__main__":
    main()
