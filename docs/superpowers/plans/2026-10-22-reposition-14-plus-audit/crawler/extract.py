"""Extract SEO/text/image data from crawled HTML pages.

Usage: python3 -I extract.py <crawl_dir> <out_json>
Reads <crawl_dir>/index.tsv and raw files. Treats all content as data.
"""
import json
import re
import sys
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse, unquote

BASE = "https://ximi4ka.ru"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "source", "track", "wbr", "param"}
BLOCK = {"p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "section",
         "article", "td", "th", "tr", "table", "br", "dt", "dd", "dl", "figcaption",
         "blockquote", "summary", "details", "header", "footer", "nav", "main", "aside",
         "form", "label", "button", "figure", "hr", "option", "select"}
INLINE_SEP = {"a", "span", "button", "small", "label"}
SKIP = {"script", "style", "noscript", "template", "svg"}
IMG_EXT = re.compile(r"\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?|$)", re.I)


def norm_img(src, page_url):
    if not src or src.startswith("data:"):
        return None
    src = src.strip()
    absu = urljoin(page_url, src)
    p = urlparse(absu)
    if p.path.startswith("/_next/image"):
        q = parse_qs(p.query)
        if "url" in q:
            return urljoin(BASE + "/", unquote(q["url"][0]))
    return absu


class Parser(HTMLParser):
    def __init__(self, url):
        super().__init__(convert_charrefs=True)
        self.url = url
        self.stack = []
        self.skip_depth = 0
        self.cur_script = None
        self.script_buf = []
        self.title = ""
        self.in_title = False
        self.meta = {}
        self.h1 = []
        self.h1_buf = None
        self.h1_depth = 0
        self.blocks = []  # (region, text)
        self.buf = []
        self.alts = []  # (region, alt, src)
        self.attrs_txt = []  # (region, attr, value)
        self.jsonld = []
        self.rsc = []
        self.images = set()

    def region(self):
        tags = [t for t, _ in self.stack]
        if "header" in tags:
            return "header"
        if "footer" in tags:
            return "footer"
        if "main" in tags:
            return "main"
        return "other"

    def flush(self):
        txt = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        txt = re.sub(r"\+\s*−\s*$", "", txt).strip()
        if txt:
            self.blocks.append((self.region(), txt))
        self.buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            k = a.get("name") or a.get("property") or a.get("itemprop")
            if k and a.get("content") is not None:
                self.meta.setdefault(k.lower(), []).append(a["content"])
                if k.lower() in ("og:image", "twitter:image", "og:image:url"):
                    n = norm_img(a["content"], self.url)
                    if n:
                        self.images.add(n)
            return
        if tag == "link":
            if a.get("as") == "image" or (a.get("rel") or "").find("icon") >= 0:
                for s in (a.get("href"), ):
                    n = norm_img(s, self.url) if s else None
                    if n:
                        self.images.add(n)
                if a.get("imagesrcset"):
                    self._srcset(a["imagesrcset"])
            return
        style = a.get("style") or ""
        for m in re.finditer(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", style):
            n = norm_img(m.group(1), self.url)
            if n:
                self.images.add(n)
        if self.skip_depth == 0:
            for at in ("aria-label", "title", "placeholder"):
                if a.get(at) and tag not in ("link",):
                    self.attrs_txt.append((self.region(), f"{tag}@{at}", a[at]))
        if tag in ("img", "source"):
            src = a.get("src")
            if src:
                n = norm_img(src, self.url)
                if n:
                    self.images.add(n)
            if a.get("srcset"):
                self._srcset(a["srcset"])
            if tag == "img" and self.skip_depth == 0:
                self.alts.append((self.region(), a.get("alt"), norm_img(src, self.url) if src else None))
            return
        if tag in VOID:
            if tag in BLOCK:
                self.flush()
            return
        if tag in SKIP:
            if tag == "script":
                self.cur_script = a.get("type") or "js"
                self.script_buf = []
            self.skip_depth += 1
            self.stack.append((tag, a))
            return
        if tag == "title" and self.skip_depth == 0:
            self.in_title = True
        if tag in BLOCK:
            self.flush()
        elif tag in INLINE_SEP:
            self.buf.append(" ")
        self.stack.append((tag, a))
        if tag == "h1":
            self.h1_buf = []
            self.h1_depth = len(self.stack)

    def _srcset(self, ss):
        best = None
        bw = -1
        for part in ss.split(","):
            bits = part.strip().split()
            if not bits:
                continue
            w = 0
            if len(bits) > 1 and bits[1].endswith("w"):
                try:
                    w = int(bits[1][:-1])
                except ValueError:
                    w = 0
            if w >= bw:
                bw, best = w, bits[0]
        n = norm_img(best, self.url) if best else None
        if n:
            self.images.add(n)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        # pop to matching tag
        idx = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                idx = i
                break
        if idx is None:
            return
        if tag in SKIP:
            if tag == "script":
                body = "".join(self.script_buf)
                if self.cur_script == "application/ld+json":
                    self.jsonld.append(body)
                elif "__next_f" in body:
                    self.rsc.append(body)
                self.cur_script = None
            self.skip_depth = max(0, self.skip_depth - 1)
            del self.stack[idx:]
            return
        if tag == "title":
            self.in_title = False
        if tag == "h1" and self.h1_buf is not None:
            self.h1.append(re.sub(r"\s+", " ", "".join(self.h1_buf)).strip())
            self.h1_buf = None
        if tag in BLOCK:
            self.flush()
        elif tag in INLINE_SEP:
            self.buf.append(" ")
        del self.stack[idx:]

    def handle_data(self, data):
        if self.skip_depth:
            if self.cur_script is not None:
                self.script_buf.append(data)
            return
        if self.in_title:
            self.title += data
            return
        self.buf.append(data)
        if self.h1_buf is not None:
            self.h1_buf.append(data)


RSC_PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', re.S)
JSTR = re.compile(r'"((?:[^"\\]|\\.)*)"')
CYR = re.compile(r"[А-Яа-яЁё]")


def rsc_strings(scripts):
    out = []
    for s in scripts:
        for m in RSC_PUSH.finditer(s):
            try:
                chunk = json.loads(m.group(1))
            except Exception:
                continue
            for sm in JSTR.finditer(chunk):
                raw = sm.group(1)
                if not CYR.search(raw):
                    continue
                try:
                    val = json.loads('"' + raw + '"')
                except Exception:
                    val = raw
                out.append(val)
    return out


IMG_IN_TEXT = re.compile(r'(?:https?://[^\s"\'\\<>()]+|/(?:uploads|images|img|_next/static/media|promo|media)/[^\s"\'\\<>()]+)\.(?:png|jpe?g|webp|gif|avif|svg)', re.I)


def main():
    crawl, out = sys.argv[1], sys.argv[2]
    pages = []
    with open(f"{crawl}/index.tsv", encoding="utf-8") as fh:
        rows = [l.rstrip("\n").split("\t") for l in fh if l.strip()]
    for r in rows:
        url, f, code, ctype = r[0], r[1], r[2], r[3]
        if code != "200" or "text/html" not in ctype:
            continue
        final = r[5] if len(r) > 5 and r[5] else url
        if final != url:
            if any(x[0] == final for x in rows):
                continue
            url = final
        html = open(f"{crawl}/{f}", encoding="utf-8", errors="replace").read()
        p = Parser(url)
        p.feed(html)
        p.flush()
        rs = rsc_strings(p.rsc)
        for m in IMG_IN_TEXT.finditer(html):
            u = m.group(0)
            if "_next/image" in u:
                continue
            n = norm_img(u, url)
            if n and urlparse(n).netloc in ("ximi4ka.ru", "static.tildacdn.com", "new.ximi4ka.ru", "thb.tildacdn.com", "optim.tildacdn.com"):
                p.images.add(n)
        for js in p.jsonld:
            for m in IMG_IN_TEXT.finditer(js):
                n = norm_img(m.group(0), url)
                if n:
                    p.images.add(n)
        pages.append({
            "url": url,
            "title": p.title.strip(),
            "meta": p.meta,
            "h1": p.h1,
            "blocks": p.blocks,
            "alts": p.alts,
            "attrs": p.attrs_txt,
            "jsonld": p.jsonld,
            "rsc": rs,
            "images": sorted(p.images),
        })
    json.dump(pages, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print("pages:", len(pages))


if __name__ == "__main__":
    main()
