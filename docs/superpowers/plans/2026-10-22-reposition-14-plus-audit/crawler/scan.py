"""Scan extracted pages, APIs and feeds for child-positioning signals.

Usage: python3 -I scan.py <pages.json> <crawl_dir> <repo_root> <out_hits.json>
"""
import json
import os
import re
import sys
from urllib.parse import urlparse

PATTERNS = [
    # (label, regex, default category)
    ("дети", r"\bдет(?:и|ей|ям|ьми|ях)\b", "A"),
    ("детский", r"\bдетск\w*", "A"),
    ("детство", r"\bдетств\w*", "A"),
    ("детишки", r"\bдетишк\w*|\bдетвор\w*", "A"),
    ("ребёнок", r"\bреб[её]н(?:ок|ка|ку|ком|ке|очек|очк\w*)\b", "A"),
    ("ребята", r"\bребят\w*", "A"),
    ("малыш", r"\bмалыш\w*", "A"),
    ("игрушка", r"\bигрушк\w*|\bигрушечн\w*", "A"),
    ("девочка/мальчик", r"\bдевоч\w*|\bмальчик\w*|\bмальчишк\w*|\bдевчонк\w*", "A"),
    ("дошкольник/детсад", r"\bдошкол\w*|\bдетсад\w*|\bсадик\w*", "A"),
    ("игра", r"\bигр(?:а|ы|е|у|ой|ам|ами|ах|ать|ает|ают|ая|ов\w*|ов)\b|\bигров\w*|\bпоигра\w*|\bсыгра\w*", "?"),
    ("юный", r"\bюн(?:ый|ого|ому|ым|ом|ая|ой|ую|ые|ых|ыми|ость\w*|ошеск\w*)\b", "?"),
    ("школа", r"\bшкол\w*", "?"),
    ("младшие классы", r"\bмладш\w*\s+(?:класс|школ)\w*|\bначальн\w*\s+школ\w*|\bпервоклас\w*", "B"),
    ("N класс", r"\b\d{1,2}(?:\s*[-–—]\s*\d{1,2})?(?:\s*-?\s*(?:й|го|м|х|ом|ый))?\s+класс\w*", "?"),
    ("ученик/учитель", r"\bучени(?:к|ка|ку|ком|ки|ков|кам|ками|ца|цы|ческ\w*)\b|\bучител\w*|\bпедагог\w*|\bрепетитор\w*", "?"),
    ("ОГЭ/ЕГЭ/олимпиада", r"\bОГЭ\b|\bЕГЭ\b|\bолимпиад\w*", "?"),
    ("возраст", r"\bвозраст\w*", "B?"),
    ("от N лет", r"\bот\s+\d{1,2}\s*(?:-?\s*(?:ти|х|ми|и))?\s*(?:лет|года?)\b", "AGE"),
    ("N+", r"(?<![\d+])\b\d{1,2}\s?\+(?![\d+])", "AGE"),
    ("N–M лет", r"\b\d{1,2}\s*(?:[-–—]|до)\s*\d{1,2}\s*(?:лет|года?)\b", "AGE"),
    ("N лет", r"\b\d{1,2}\s*(?:лет|года?)\b", "AGE"),
    ("родители", r"\bродител\w*", "C"),
    ("мама/папа", r"\bмам(?:а|ы|е|у|ой|ам|ами|ах|очк\w*|ин\w*)?\b|\bпап(?:а|ы|е|у|ой|ам|ами|ах|очк\w*)?\b", "C"),
    ("сын/дочь", r"\bсын(?:а|у|ом|е|ок|ку|ишк\w*|овь\w*)?\b|\bдоч(?:ь|ери|ерью|ерей|ерям|к\w*)\b", "C"),
    ("внуки", r"\bвнук\w*|\bвнуч\w*", "C"),
    ("семья", r"\bсемь(?:я|и|е|ю|ей|ями|ях)\b|\bсемейн\w*", "C"),
    ("присмотр/взрослые", r"\bприсмотр\w*|\bвзросл\w*", "C"),
    ("развивающий", r"\bразвива\w*|\bразвит(?:ие|ия|ию|ием)\b|\bразовь\w*", "C"),
    ("каникулы", r"\bканикул\w*", "C"),
    ("день рождения/праздник", r"\bд(?:е|н)\w*\s+рождени\w*|\bпраздник\w*", "C"),
    ("подарок", r"\bподар\w*", "C?"),
    ("досуг", r"\bдосуг\w*|\bзанять\b|\bчем\s+заня\w*", "C?"),
    ("en: kids/children", r"(?i)\bkids?\b|\bchild\w*|\btoys?\b|\bboys?\b|\bgirls?\b", "A"),
    ("en: family/parents", r"(?i)\bfamil\w*|\bparent\w*|\bschool\w*|\bteen\w*|\bages?\b|\byoung\b|\bjunior\b", "?"),
]
CRE = [(l, re.compile(r, re.I), c) for l, r, c in PATTERNS]
JSONLD_KEYS = re.compile(r'"(audience|PeopleAudience|suggestedMinAge|suggestedMaxAge|suggestedAge|suggestedGender|ageGroup|isFamilyFriendly|typicalAgeRange|educationalLevel|audienceType|age)"', re.I)
KEEP = re.compile(r"недоступн\w*[^.]{0,40}дет|вне\s+досягаемости[^.;]{0,20}дет|(?:вдали|подальше)\s+от\s+дет|хран\w*[^.;]{0,80}дет|дет\w*[^.;]{0,30}недоступн", re.I)


def norm(s, tags=True):
    if tags:
        s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("+−", " ").replace("ё", "е").replace("Ё", "Е").replace(" ", " ").replace("&nbsp;", " ")
    s = re.sub(r"[«»\"“”„'’]", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def snippet(text, m, width=110):
    a = max(0, m.start() - width)
    b = min(len(text), m.end() + width)
    while a > 0 and text[a - 1] not in " .!?\n":
        a -= 1
        if m.start() - a > width + 40:
            break
    while b < len(text) and text[b] not in " .!?\n":
        b += 1
        if b - m.end() > width + 40:
            break
    s = text[a:b].strip()
    return ("…" if a > 0 else "") + s + ("…" if b < len(text) else "")


def age_cat(label, txt):
    nums = [int(x) for x in re.findall(r"\d{1,2}", txt)]
    if not nums:
        return None
    lo = min(nums)
    if label == "N+":
        n = nums[0]
        return "B" if n < 14 else "AGE14"
    if label in ("от N лет",):
        return "B" if lo < 14 else "AGE14"
    if label == "N–M лет":
        return "B" if lo < 14 else "AGE14"
    if label == "N лет":
        return "B?" if lo < 14 else "AGE14?"
    return None


def classify(label, cat, mtxt, ctx):
    if KEEP.search(ctx) and cat in ("A",):
        return "K"
    if cat == "AGE":
        return age_cat(label, mtxt) or "?"
    if label == "N класс":
        n = int(re.findall(r"\d{1,2}", mtxt)[0])
        return "B" if n <= 7 else "?"
    return cat


PRIO = ["A", "B", "C", "B?", "?", "C?", "AGE14?", "AGE14", "K"]
SENT = re.compile(r"(?<=[.!?…])\s+(?=[A-ZА-ЯЁ0-9«\"(—–-])|\s*\n+\s*|(?<=[a-zа-яё])·(?=[a-zа-яё])")


def trim(sent, start, width=200):
    if len(sent) <= 2 * width + 60:
        return sent
    a = max(0, start - width)
    b = min(len(sent), start + width)
    while a > 0 and sent[a - 1] != " ":
        a -= 1
    while b < len(sent) and sent[b] != " ":
        b += 1
    return ("…" if a > 0 else "") + sent[a:b].strip() + ("…" if b < len(sent) else "")


def scan_text(text, base):
    out = []
    for sent in SENT.split(text):
        sent = sent.strip()
        if not sent:
            continue
        found = []
        keep_spans = [m.span() for m in KEEP.finditer(sent)]
        for label, rx, cat in CRE:
            for m in rx.finditer(sent):
                c = classify(label, cat, m.group(0), sent[max(0, m.start()-60): m.end()+60])
                if c == "K" or (c == "A" and any(a <= m.start() < b for a, b in keep_spans)):
                    c = "K"
                found.append((m.start(), label, m.group(0), c))
        if not found:
            continue
        found.sort()
        cats = [f[3] for f in found]
        cat = min(cats, key=lambda c: PRIO.index(c) if c in PRIO else 99)
        h = dict(base)
        h.update({
            "label": ", ".join(dict.fromkeys(f[1] for f in found)),
            "match": found[0][2],
            "matches": [f[2] for f in found],
            "cats": cats,
            "quote": trim(sent, found[0][0]),
            "cat": cat,
        })
        out.append(h)
    return out


def ptype(url):
    p = urlparse(url)
    path = p.path
    if path.startswith("/en"):
        path = path[3:] or "/"
    if path.startswith("/api/"):
        return "API"
    if path in ("/yml.xml", "/turbo.xml", "/blog/rss.xml", "/sitemap.xml"):
        return "фид"
    if path in ("/llms.txt", "/robots.txt"):
        return "фид"
    if path == "/":
        return "главная"
    if path.startswith("/amp/product/"):
        return "товар (AMP)"
    if path.startswith("/amp/article/"):
        return "статья (AMP)"
    if path.startswith("/product/"):
        return "товар"
    if path.startswith("/categories") or path == "/catalog":
        return "категория"
    if path == "/blog":
        return "блог (список)"
    if path.startswith("/blog/"):
        return "статья"
    return "CMS/служебная"


def load_repo(root):
    code, data = {}, {}
    code_dirs = ["web/app", "web/components", "web/lib", "shared", "api/src"]
    for d in code_dirs:
        for dp, dn, fn in os.walk(os.path.join(root, d)):
            dn[:] = [x for x in dn if x not in ("node_modules", ".next")]
            for f in fn:
                if not re.search(r"\.(tsx?|json|txt|md|mjs)$", f) or re.search(r"\.test\.|\.spec\.", f):
                    continue
                path = os.path.join(dp, f)
                try:
                    t = open(path, encoding="utf-8").read()
                except Exception:
                    continue
                rel = os.path.relpath(path, root)
                (data if "/seeds/" in rel or "/migrations/" in rel else code)[rel] = norm(t.replace("{' '}", " "), tags=False)
    for d in ["docs", "deploy"]:
        for dp, dn, fn in os.walk(os.path.join(root, d)):
            for f in fn:
                if not re.search(r"\.(json|md|csv|txt|html|ya?ml)$", f):
                    continue
                path = os.path.join(dp, f)
                try:
                    t = open(path, encoding="utf-8").read()
                except Exception:
                    continue
                data[os.path.relpath(path, root)] = norm(t, tags=False)
    return code, data


def flatten(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from flatten(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def main():
    pages_fn, crawl, repo, out_fn = sys.argv[1:5]
    pages = json.load(open(pages_fn, encoding="utf-8"))
    code, data = load_repo(repo)

    # API corpus for origin attribution
    api = []  # (label, normtext)
    raw = f"{crawl}/raw"
    api_files = {
        "товары (админка/БД)": "https___ximi4ka.ru_api_public_products_limit_1000",
        "категории (админка/БД)": "https___ximi4ka.ru_api_public_categories_limit_200",
        "CMS-страницы (админка/БД)": "https___ximi4ka.ru_api_public_pages_limit_200",
        "блог (админка/БД)": "https___ximi4ka.ru_api_public_blog_limit_100",
        "настройки (админка/БД)": "https___ximi4ka.ru_api_public_settings",
    }
    api_json = {}
    for lab, fn in api_files.items():
        d = json.load(open(f"{raw}/{fn}", encoding="utf-8"))
        api_json[lab] = d
        items = d["data"] if isinstance(d["data"], list) else [d["data"]]
        for it in items:
            key = it.get("slug", "settings") if isinstance(it, dict) else "?"
            for p, s in flatten(it):
                if p.endswith(("id", "Id", "url", "Url", "At")):
                    continue
                api.append((f"{lab}: {key}.{re.sub(r'\[\d+\]', '[]', p)}", norm(s)))

    cms_slugs = {it["slug"] for it in api_json["CMS-страницы (админка/БД)"]["data"]}

    def fallback(url):
        path = urlparse(url).path
        if path.startswith("/en/"):
            path = path[3:]
        m = re.match(r"^/(?:amp/)?product/([^/]+)", path)
        if m:
            return f"товар {m.group(1)} (админка/БД; дословно не найдено)"
        m = re.match(r"^/(?:blog|amp/article)/([^/]+)", path)
        if m:
            return f"статья {m.group(1)} (админка/БД; дословно не найдено)"
        if path.strip("/") in cms_slugs:
            return f"CMS-страница {path.strip('/')} (админка/БД; дословно не найдено)"
        if path in ("/turbo.xml", "/yml.xml", "/blog/rss.xml", "/llms.txt"):
            return "фид собирается кодом из данных БД (дословно не найдено)"
        return "дословно не найдено (вероятно, шаблон/код)"

    def origin(quote, match, url=""):
        q = norm(quote.replace("…", " "))
        mm = norm(match)
        i = q.find(mm)
        needles = []
        if i >= 0:
            needles.append(q[max(0, i - 25): i + len(mm) + 25].strip())
            needles.append(q[max(0, i - 12): i + len(mm) + 12].strip())
        needles.append(q[:60])
        res = []
        for nd in needles:
            if len(nd) < 8:
                continue
            a = [lab for lab, t in api if nd in t]
            c = [p for p, t in code.items() if nd in t]
            dd = [p for p, t in data.items() if nd in t]
            if a or c or dd:
                if a:
                    res.append(a[0] + (f" (+{len(a)-1})" if len(a) > 1 else ""))
                if c:
                    res.append("код: " + ", ".join(sorted(c)[:3]))
                if dd:
                    res.append("данные репо: " + ", ".join(sorted(dd)[:2]))
                break
        return "; ".join(res) if res else fallback(url)

    hits = []
    for p in pages:
        url = p["url"]
        base = {"url": url, "ptype": ptype(url)}
        def add(element, region, text):
            for h in scan_text(text, dict(base, element=element, region=region)):
                hits.append(h)
        add("title", "head", p["title"])
        for k, vals in p["meta"].items():
            if k in ("description", "keywords") or k.startswith("og:") or k.startswith("twitter:"):
                for v in vals:
                    add(f"meta {k}", "head", v)
        for h1 in p["h1"]:
            add("H1", "main", h1)
        for region, txt in p["blocks"]:
            add("текст", region, txt)
        for region, alt, src in p["alts"]:
            if alt:
                add("alt", region, alt)
        for region, at, val in p["attrs"]:
            add(f"атрибут {at}", region, val)
        for js in p["jsonld"]:
            for m in JSONLD_KEYS.finditer(js):
                hits.append(dict(base, element="JSON-LD key", region="head", label="JSON-LD " + m.group(1), match=m.group(0), quote=js[max(0, m.start()-80): m.end()+160], cat="D"))
            try:
                obj = json.loads(js)
                for path, s in flatten(obj):
                    for h in scan_text(s, dict(base, element=f"JSON-LD {re.sub(r'\[\d+\]', '[]', path)}", region="head")):
                        hits.append(h)
            except Exception:
                add("JSON-LD(raw)", "head", js)
        vis = norm(" ".join([p["title"]] + [b[1] for b in p["blocks"]] + [a[1] or "" for a in p["alts"]] + [a[2] for a in p["attrs"]] + p["jsonld"] + sum(p["meta"].values(), [])))
        for s in p["rsc"]:
            s = re.sub(r"<[^>]+>", "\n", s)
            for h in scan_text(s, dict(base, element="RSC-данные (не в HTML)", region="rsc")):
                if re.sub(r"^\d+-", "", norm(h["quote"].replace("…", "")))[:60] not in vis:
                    hits.append(h)

    # feeds and text endpoints
    def read(fn):
        return open(f"{raw}/{fn}", encoding="utf-8", errors="replace").read()
    feeds = {
        "https://ximi4ka.ru/llms.txt": "https___ximi4ka.ru_llms.txt",
        "https://ximi4ka.ru/robots.txt": "https___ximi4ka.ru_robots.txt",
    }
    for url, fn in feeds.items():
        for i, line in enumerate(read(fn).splitlines(), 1):
            for h in scan_text(line, {"url": url, "ptype": "фид", "element": f"строка {i}", "region": "feed"}):
                hits.append(h)
    yml = read("https___ximi4ka.ru_yml.xml")
    for m in re.finditer(r"<offer\b.*?</offer>", yml, re.S):
        off = m.group(0)
        u = re.search(r"<url>(.*?)</url>", off)
        u = u.group(1) if u else "?"
        for tag in re.finditer(r"<(name|description|sales_notes|age|param[^>]*|typePrefix|model|country_of_origin|manufacturer_warranty)>(.*?)</\1?[a-z_]*>", off, re.S):
            for h in scan_text(re.sub(r"<[^>]+>", " ", tag.group(2)), {"url": "https://ximi4ka.ru/yml.xml", "ptype": "фид", "element": f"YML <{tag.group(1)}> ({u.replace('https://ximi4ka.ru','')})", "region": "feed"}):
                hits.append(h)
        if re.search(r"<age\b|Возраст", off):
            hits.append({"url": "https://ximi4ka.ru/yml.xml", "ptype": "фид", "element": f"YML age ({u})", "region": "feed", "label": "YML age", "match": "age", "quote": off[:300], "cat": "D"})
    for m in re.finditer(r"<category\b[^>]*>(.*?)</category>", yml):
        for h in scan_text(m.group(1), {"url": "https://ximi4ka.ru/yml.xml", "ptype": "фид", "element": "YML <category>", "region": "feed"}):
            hits.append(h)
    shop_head = yml.split("<offers>")[0]
    for h in scan_text(re.sub(r"<[^>]+>", " ", shop_head), {"url": "https://ximi4ka.ru/yml.xml", "ptype": "фид", "element": "YML <shop>", "region": "feed"}):
        hits.append(h)
    for fn, url in (("https___ximi4ka.ru_turbo.xml", "https://ximi4ka.ru/turbo.xml"), ("https___ximi4ka.ru_blog_rss.xml", "https://ximi4ka.ru/blog/rss.xml")):
        x = read(fn)
        ch = x.split("<item")[0]
        for h in scan_text(re.sub(r"<[^>]+>", " ", ch), {"url": url, "ptype": "фид", "element": "channel", "region": "feed"}):
            hits.append(h)
        for m in re.finditer(r"<item\b.*?</item>", x, re.S):
            it = m.group(0)
            lk = re.search(r"<link>(.*?)</link>", it)
            lk = lk.group(1).replace("https://ximi4ka.ru", "") if lk else "?"
            body = re.sub(r"<!\[CDATA\[|\]\]>", " ", it)
            body = body.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"')
            body = re.sub(r"</?(?:p|h[1-6]|li|ul|ol|br|div|header|figure|figcaption|table|tr|td|th|title|link|description|pubDate|item|turbo:content|section|button|details|summary)\b[^>]*>", "\n", body)
            body = re.sub(r"<[^>]+>", " ", body)
            body = re.sub(r"[ \t]+", " ", body)
            for h in scan_text(body, {"url": url, "ptype": "фид", "element": f"item {lk}", "region": "feed"}):
                hits.append(h)

    # API-only fields (not necessarily rendered)
    for lab, d in api_json.items():
        items = d["data"] if isinstance(d["data"], list) else [d["data"]]
        for it in items:
            key = it.get("slug", "settings")
            for path, s in flatten(it):
                if path.endswith(("id", "Id", "At")) or "images" in path and path.endswith("url"):
                    continue
                s2 = re.sub(r"</?(?:p|h[1-6]|li|ul|ol|br|div)\b[^>]*>", "\n", s)
                for h in scan_text(re.sub(r"<[^>]+>", " ", s2), {"url": f"API {lab}", "ptype": "API", "element": f"{key}.{re.sub(r'\[\d+\]', '[]', path)}", "region": "api"}):
                    hits.append(h)

    for h in hits:
        h["origin"] = origin(h["quote"], h["match"], h["url"]) if h["region"] != "api" else h["url"].replace("API ", "")
    json.dump(hits, open(out_fn, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("hits:", len(hits))


if __name__ == "__main__":
    main()
