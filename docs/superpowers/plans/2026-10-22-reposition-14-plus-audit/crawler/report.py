"""Build grouped findings for the markdown report.
Usage: python3 -I report.py <hits.json> <out_groups.json>
Applies manual overrides, groups hits by normalized quote.
"""
import json
import re
import sys
from collections import defaultdict

# (regex on quote, category or None=drop, note)
OVERRIDES = [
    (r"срок хранения \d+ год", None, "срок хранения, не возраст"),
    (r"^основано 3 года$|^01 год$", None, "счётчик «основано 3 года»"),
    (r"по возрастанию атомной массы", None, "«возрастание» массы"),
    (r"прав и свобод человека", None, "«личная и семейная тайна» в политике"),
    (r"как «семьи»", None, "«семьи» элементов"),
    (r"где работают взрослые специалисты", None, "о взрослых специалистах"),
    (r"подарите радость открытий своим близким", None, "подарок близким, без детей"),
    (r"не оставляйте открытые пробирки без присмотра", None, "«без присмотра» о пробирках, не о взрослых"),
    (r"^Реактив в подарок|Слайд 1: Реактив в подарок|^Получил в подарок", None, "акция «реактив в подарок»"),
    (r"Дочь \(11 лет\)", "B,C", "отзыв: ребёнок 11 лет делает опыты сам"),
    (r"До 14 лет под присмотром взрослых", "B", "допускает применение младше 14 лет под присмотром. При ответе «не проходит младше 14» спорно; «для самостоятельного использования от 14 лет» оставить"),
    (r"Для какого возраста подходит набор Химичка 3\.0", "B", "вопрос FAQ, ответ — «для детей и подростков от 10 до 18 лет»"),
    (r"С какого возраста можно проводить домашние опыты", "B", "вопрос FAQ в статье для детей"),
    (r"возрастную рекомендацию нужно смотреть на странице", "C", ""),
    (r"^Возраст и подготовка", "C", "подзаголовок про возраст"),
    (r"соответствуют возрастным маркировкам", "C", "отсылка к возрастной маркировке в ответе «Безопасны ли наборы для детей?»"),
    (r"наборы для разных возрастов", "C", "сквозной блок про «разные возрасты»"),
    (r"подобрать набор под интересы и возраст", "C", "подбор «по возрасту»"),
    (r"Для каждого указано, с какого возраста", "C", "отсылка к возрастам наборов (от 8, 10 и 12 лет)"),
    (r"не игрушк", "K", "предупреждение «не игрушка» (подчёркивает, что это НЕ игрушка)"),
    (r"школьникам с ней работать нельзя", "?", "запрет для школьников (предупреждение)"),
    (r"Можно устроить игру|частью игры", "C", "игровая подача в статье для детей"),
    (r"образ «юного учёного»", "C", "«юный учёный» в статье для детей"),
    (r"^Ребята!", "?", "обращение «Ребята!» на странице FAQ"),
    (r"Для ребят, выбравших естественно-научный профиль", "?", "«ребята» = 9-классники (около 15 лет)"),
    (r"^родители$", "C", "подзаголовок блока отзывов «Что говорят родители»"),
    (r"обратитесь за помощью к взрослым", "C", "подразумевает, что пользователь несовершеннолетний"),
    (r"Набор юного химика|набора юного химика", None, None),  # keep auto cat, see JUNIOR below
]
JUNIOR_NOTE = "«набор юного химика» — пограничное SEO-словосочетание"
TECH = re.compile(r"^(title|meta |H1|JSON-LD)")
PRIO = {"A": 0, "B": 1, "C": 2, "?": 3, "K": 4}


def norm(q):
    q = q.replace("ё", "е").replace("Ё", "Е").lower()
    q = re.sub(r"^\d+-", "", q)
    q = re.sub(r"https?://\S+", " ", q)
    return re.sub(r"\W+", " ", q).strip()


def simplify_el(e, url):
    if url.endswith("/turbo.xml"):
        return "Turbo-фид"
    if url.endswith("/blog/rss.xml"):
        return "RSS"
    if url.endswith("/llms.txt"):
        return "llms.txt"
    if url.endswith("/yml.xml"):
        return re.sub(r"\s*\(.*\)$", "", e).replace("YML ", "YML ")
    if e.startswith("JSON-LD mainEntity"):
        return "JSON-LD FAQPage"
    if e.startswith("JSON-LD"):
        return "JSON-LD " + e.split(" ", 1)[1].split(".")[0].split("[")[0]
    if e in ("meta og:description", "meta twitter:description"):
        return "og/twitter:description"
    if e in ("meta og:title", "meta twitter:title"):
        return "og/twitter:title"
    if e.startswith("атрибут"):
        return e.replace("атрибут ", "")
    return e


def main():
    H = json.load(open(sys.argv[1], encoding="utf-8"))
    groups = defaultdict(list)
    for h in H:
        if h["region"] == "api":
            continue
        groups[norm(h["quote"])].append(h)
    # drop RSC-only duplicates of visible quotes (prefix match)
    visible_keys = [k for k, hs in groups.items() if any(x["region"] != "rsc" for x in hs)]
    out = []
    dropped = []
    for k, hs in groups.items():
        if all(x["region"] == "rsc" for x in hs):
            if any(k[:80] in v or v[:80] in k for v in visible_keys if len(v) > 20):
                continue
        quote = sorted(hs, key=lambda x: (x["region"] == "rsc", len(x["quote"])))[0]["quote"]
        cats = set()
        for x in hs:
            for c in x["cats"]:
                cats.add(c)
        base = {"A", "B", "C", "K"} & cats
        if "?" in cats or "B?" in cats or "C?" in cats:
            base.add("?") if not base else None
        if "K" in base and len(base) > 1:
            # sentence with a storage warning plus other signals: keep the others
            pass
        note = ""
        for rx, cat, nt in OVERRIDES:
            if re.search(rx, quote, re.I):
                if cat is None and nt is None:
                    note = JUNIOR_NOTE
                    break
                if cat is None:
                    dropped.append((quote, nt, sorted({x["url"] for x in hs})[:3]))
                    base = None
                    break
                base = set(cat.split(","))
                note = nt
                break
        if base is None:
            continue
        if not base:
            if cats & {"AGE14", "AGE14?"}:
                base = {"14+"}
            else:
                continue
        if "K" in base and (base & {"A"}):
            # A-match outside the warning phrase
            pass
        if any(x["region"] != "rsc" for x in hs):
            hs = [x for x in hs if x["region"] != "rsc"]
        elements = []
        urls = []
        for x in hs:
            e = simplify_el(x["element"], x["url"])
            if e not in elements:
                elements.append(e)
            if x["url"] not in urls:
                urls.append(x["url"])
        tech = any(TECH.match(x["element"]) for x in hs) or any(x["url"].endswith(("/yml.xml", "/llms.txt", "/blog/rss.xml")) for x in hs)
        cat_list = sorted(base, key=lambda c: PRIO.get(c, 9))
        if tech and cat_list != ["14+"]:
            cat_list.append("D")

        def pref(x):
            u = x["url"]
            order = 0
            if "/en/" in u or u.endswith("/en"):
                order += 2
            if "/amp/" in u:
                order += 3
            if x["region"] in ("feed",):
                order += 5
            if x["region"] == "rsc":
                order += 8
            if x["ptype"] in ("категория", "блог (список)") :
                order += 1
            return order
        origins = [x["origin"] for x in sorted(hs, key=pref)]
        origin = next((o for o in origins if not o.startswith(("дословно", "товар ", "статья ", "CMS-страница ", "фид"))), origins[0])
        home = None
        m = re.search(r"(товары|блог|CMS-страницы) \(админка/БД\): ([^.\s]+)\.", origin)
        if m:
            home = {"товары": "/product/", "блог": "/blog/", "CMS-страницы": "/"}[m.group(1)] + m.group(2)
            if home == "/home":
                home = "/"
        cand = [x for x in hs if home and x["url"] == "https://ximi4ka.ru" + home]
        prim = cand[0] if cand else sorted(hs, key=pref)[0]
        out.append({
            "quote": quote,
            "cat": ", ".join(cat_list),
            "primary": prim["url"],
            "ptype": prim["ptype"],
            "elements": elements,
            "urls": urls,
            "origin": origin,
            "note": note,
            "labels": sorted({l.strip() for x in hs for l in x["label"].split(",")}),
            "occ": sorted({(x["url"], x["region"], x["element"], x["ptype"]) for x in hs}),
        })
    json.dump({"groups": out, "dropped": dropped}, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(Counter(g["cat"] for g in out))
    print("dropped", len(dropped))


if __name__ == "__main__":
    main()
