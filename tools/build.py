"""BariPrint static site generator (stdlib only).

src/partials/*.html + src/pages/*.html -> page HTML, sitemap.xml, vercel.json (CSP hash).
Run from anywhere:  python -P tools/build.py
"""
import base64
import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
IMG = ROOT / "assets" / "img"
SITE = "https://bari-print.ru"
OG_IMAGE = SITE + "/assets/img/og-home.jpg"
LEGAL = {"/politika-konfidenczialnosti", "/soglasie-na-obrabotku-personalnykh-dannykh"}

# The one inline script (CSP-hashed). Home + first visit of the session + no hash/back-forward + motion OK -> intro.
BOOT = ("(function(){var d=document.documentElement;d.className+=' js';try{var n=performance.getEntriesByType"
        "('navigation')[0];if(d.dataset.page==='home'&&!location.hash&&!(n&&n.type==='back_forward')"
        "&&!sessionStorage.getItem('bp-seen')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)"
        "d.className+=' bp-intro'}catch(e){}})();")

CSP = ("default-src 'self'; script-src 'self' '{hash}' https://mc.yandex.ru https://mc.yandex.com https://yastatic.net; "
       "style-src 'self'; font-src 'self'; img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com; "
       "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru; "
       "frame-src https://yandex.ru https://*.yandex.ru; frame-ancestors 'none'; base-uri 'self'; "
       "form-action 'self'; object-src 'none'; upgrade-insecure-requests")


ICON = r'<svg class="i" aria-hidden="true"><use href="/assets/img/icons.svg#i-\1"></use></svg>'


def boot_hash():
    return "sha256-" + base64.b64encode(hashlib.sha256(BOOT.encode("utf-8")).digest()).decode()


def read(p):
    return Path(p).read_text(encoding="utf-8")


def parse_page(path):
    """A page = '<!--\\nkey: value\\n...-->' header + main HTML."""
    txt = read(path)
    m = re.match(r"<!--\n(.*?)\n-->\n", txt, re.S)
    assert m, f"{path}: missing meta header"
    meta = dict(line.split(": ", 1) for line in m.group(1).splitlines() if line.strip())
    return meta, txt[m.end():]


# ---------- images: [[img name | alt | sizes | class | eager]] -> <img srcset> ----------
def split_img_spec(spec):
    """alt may contain '|': it runs up to the first field that looks like a sizes value (... 10vw / 1px)."""
    raw = spec.split("|")
    i = next((k for k in range(2, len(raw)) if re.search(r"\d(?:vw|px)\b", raw[k])), len(raw))
    return [raw[0].strip(), "|".join(raw[1:i]).strip()] + [p.strip() for p in raw[i:]]


def img_tag(spec):
    parts = split_img_spec(spec)
    name, alt = parts[0], html.escape(parts[1], quote=True)
    sizes = parts[2] if len(parts) > 2 and parts[2] else "100vw"
    cls = parts[3] if len(parts) > 3 else ""
    mode = parts[4] if len(parts) > 4 else ""
    eager = mode == "eager"
    files = sorted(IMG.glob(f"{name}-[0-9]*.webp"), key=lambda f: int(f.stem.rsplit("-", 1)[1]))
    files = [f for f in files if re.fullmatch(re.escape(name) + r"-\d+", f.stem)]
    assert files, f"no image files for {name}"
    big = files[-1]
    w, h = webp_size(big)
    srcset = ", ".join(f"/assets/img/{f.name} {f.stem.rsplit('-', 1)[1]}w" for f in files)
    attrs = [f'src="/assets/img/{files[0].name}"', f'srcset="{srcset}"', f'sizes="{sizes}"',
             f'width="{w}"', f'height="{h}"', f'alt="{alt}"', 'decoding="async"']
    attrs.append('fetchpriority="high"' if eager else 'loading="lazy"')
    real = "<img " + " ".join(([f'class="{cls}"'] if cls else []) + attrs) + ">"
    if mode != "defer":
        return real
    # site.js swaps the real sources in on first interaction; <noscript> keeps them for no-JS and crawlers
    attrs[0] = 'src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" ' \
               f'data-src="/assets/img/{files[0].name}"'
    attrs[1] = f'data-srcset="{srcset}"'
    return "<img " + " ".join(([f'class="{cls}"'] if cls else []) + attrs) + f"><noscript>{real}</noscript>"


def webp_size(path):
    b = path.read_bytes()[:40]
    assert b[:4] == b"RIFF" and b[8:12] == b"WEBP", path
    fmt = b[12:16]
    if fmt == b"VP8X":
        return 1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little")
    if fmt == b"VP8 ":
        return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
    if fmt == b"VP8L":
        bits = int.from_bytes(b[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise ValueError(path)


# ---------- FAQ JSON-LD from the visible <details class="faq"> markup ----------
class _Text(HTMLParser):
    BLOCK = {"p", "li", "tr", "dt", "dd", "h3", "h4", "div", "td", "th", "table", "ul", "ol"}

    def __init__(self):
        super().__init__()
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self.out.append(" ")

    def handle_data(self, data):
        self.out.append(data)

    def text(self):
        lines = (" ".join(l.split()) for l in "".join(self.out).split("\n"))
        return "\n".join(l for l in lines if l)


def to_text(fragment):
    p = _Text()
    p.feed(fragment)
    return p.text()


def faq_items(body):
    items = []
    body = re.sub(r"\[\[i [\w-]+\]\]", "", body)  # icons are substituted later; keep their svg out of the JSON
    for m in re.finditer(r'<details class="faq__item"[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>', body, re.S):
        q, a = to_text(m.group(1)), to_text(m.group(2))
        items.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
    return items


def jsonld(meta, body, path):
    if meta.get("page") == "home":
        org = json.loads(read(SRC / "partials" / "org.json"))
        faq = faq_items(body)
        assert len(faq) >= 9, f"FAQ items found: {len(faq)}"
        graph = [org,
                 {"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": "Бари Принт",
                  "inLanguage": "ru-RU", "publisher": {"@id": SITE + "/#org"}},
                 {"@type": "FAQPage", "@id": SITE + "/#faq", "mainEntity": faq}]
        data = {"@context": "https://schema.org", "@graph": graph}
    elif meta.get("crumb"):
        data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": meta["crumb"], "item": SITE + path}]}
    else:
        return ""
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/ld+json">{raw}</script>\n'


# ---------- assembly ----------
def mark_current(chrome, path):
    """aria-current on links to this page (header, menus, footer)."""
    return re.sub(rf'(<a\b[^>]*\shref="{re.escape(path)}")', r'\1 aria-current="page"', chrome) if path != "/" else chrome


def breadcrumb(meta):
    return ('<nav class="crumbs" aria-label="Хлебные крошки"><ol><li><a href="/">Главная</a></li>'
            f'<li><span aria-current="page">{html.escape(meta["crumb"])}</span></li></ol></nav>\n')


def build_page(src_path, partials):
    meta, body = parse_page(src_path)
    path = meta["path"]
    for name, frag in partials.items():
        body = body.replace("{{> " + name + "}}", frag)
    body = body.replace("{{crumbs}}", breadcrumb(meta) if meta.get("crumb") else "")
    if "{{toc}}" in body:
        heads = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', body)
        items = "".join(f'<li><a href="#{i}">{t}</a></li>' for i, t in heads)
        body = body.replace("{{toc}}", f'<nav class="toc" aria-label="Содержание"><p>Содержание</p><ol>{items}</ol></nav>')
    body = re.sub(r"\[\[img (.*?)\]\]", lambda m: img_tag(m.group(1)), body, flags=re.S)
    canonical = SITE + (path if path != "/" else "/")
    canon_tags = "" if path == "/404" else (f'<link rel="canonical" href="{canonical}">\n'
                                            f'<meta property="og:url" content="{canonical}">\n')
    head = partials["head"]
    preload = ""
    if meta.get("preload"):
        name, sizes = meta["preload"].split(" | ")
        tag = img_tag(f"{name} | x | {sizes}")
        srcset = re.search(r'srcset="([^"]+)"', tag).group(1)
        preload = (f'<link rel="preload" as="image" type="image/webp" imagesrcset="{srcset}" '
                   f'imagesizes="{sizes}" fetchpriority="high">\n')
    values = {
        "title": html.escape(meta["title"]), "description": html.escape(meta["description"]),
        "canonical_tags": canon_tags,
        "html_attrs": ' data-page="home"' if meta.get("page") == "home" else "",
        "robots": '<meta name="robots" content="noindex">\n' if path == "/404" else "",
        "preload": preload, "boot": BOOT, "jsonld": jsonld(meta, body, path), "og_image": OG_IMAGE,
    }
    for k, v in values.items():
        head = head.replace("{{" + k + "}}", v)
    chrome_top = mark_current(partials["header"], path)
    chrome_bottom = mark_current(partials["footer"] + partials["chrome"], path)
    out = head + chrome_top + f'<main id="main" tabindex="-1">\n{body}</main>\n' + chrome_bottom + "</body>\n</html>\n"
    out = re.sub(r"\[\[i ([\w-]+)\]\]", ICON, out)
    check(out, path)
    dest = ROOT / ("404.html" if path == "/404" else ("index.html" if path == "/" else path.strip("/") + "/index.html"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8", newline="\n")
    return path, dest, len(out.encode("utf-8"))


def check(out, path):
    """Definition-of-done guards: fail the build instead of shipping a violation."""
    for left in ("{{", "[["):
        i = out.find(left)
        assert i < 0, f"{path}: unreplaced '{left}' near {out[i:i + 50]!r}"
    for blob in re.findall(r'<script type="application/ld\+json">(.*?)</script>', out, re.S):
        try:
            json.loads(blob)
        except ValueError as e:
            raise AssertionError(f"{path}: invalid JSON-LD: {e}") from e
    banned = ["tildacdn", "tilda", "jquery", "googleapis", "unsplash.com", 'style="', "onclick", "<form", "<style"]
    low = out.lower()
    for b in banned:
        assert b not in low, f"{path}: banned '{b}'"
    scripts = re.findall(r"<script(?![^>]*(?:src=|application/ld\+json))[^>]*>(.*?)</script>", out, re.S)
    assert scripts == [BOOT], f"{path}: inline scripts must be exactly the boot script"
    assert len(re.findall(r"<h1[\s>]", out)) == 1, f"{path}: exactly one h1"
    assert re.search(r"\son[a-z]+=", out) is None, f"{path}: inline handler"
    if path not in LEGAL:
        visible = re.sub(r"<script.*?</script>|<!--.*?-->", "", out.split("<body>", 1)[1], flags=re.S)
        assert "—" not in visible, f"{path}: em-dash in marketing copy"
    for href in re.findall(r'<a\b[^>]*target="_blank"[^>]*>', out):
        assert 'rel="noopener noreferrer"' in href, f"{path}: external link without rel: {href}"
    ids = re.findall(r'\sid="([^"]+)"', out)
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, f"{path}: duplicate ids {dup}"


def write_sitemap(paths):
    urls = "".join(f"<url><loc>{SITE}{p if p != '/' else '/'}</loc></url>\n"
                   for p in sorted(paths, key=lambda p: (p != "/", p)) if p != "/404")
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls + "</urlset>\n", encoding="utf-8", newline="\n")


def write_vercel():
    sec = [{"key": "Content-Security-Policy", "value": CSP.format(hash=boot_hash())},
           {"key": "X-Content-Type-Options", "value": "nosniff"},
           {"key": "X-Frame-Options", "value": "DENY"},
           {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
           {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
           {"key": "Cross-Origin-Opener-Policy", "value": "same-origin"},
           {"key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload"}]
    cfg = {"cleanUrls": True, "trailingSlash": False, "headers": [
        {"source": "/(.*)", "headers": sec},
        {"source": "/(.*)", "has": [{"type": "host", "value": "bariprint.vercel.app"}],
         "headers": [{"key": "X-Robots-Tag", "value": "noindex"}]},
        {"source": "/assets/(img|fonts)/(.*)",
         "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]}]}
    (ROOT / "vercel.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def write_css():
    """src/css/site.css -> assets/css/site.css: drop comments, collapse whitespace (never glue tokens)."""
    css = re.sub(r"/\*.*?\*/", "", read(SRC / "css" / "site.css"), flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r" ?([{};,]) ?", r"\1", css).replace(";}", "}").strip()
    out = ROOT / "assets" / "css" / "site.css"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(css + "\n", encoding="utf-8", newline="\n")
    return len(css.encode("utf-8"))


def main():
    print(f"{write_css() / 1024:7.1f} KB  assets/css/site.css")
    assert split_img_spec("a | x|y | 10vw | c | eager") == ["a", "x|y", "10vw", "c", "eager"]
    assert split_img_spec("a | | 1px | is-on") == ["a", "", "1px", "is-on"]
    partials = {p.stem: read(p) for p in sorted((SRC / "partials").glob("*.html"))}
    built = [build_page(p, partials) for p in sorted((SRC / "pages").glob("*.html"))]
    made = {dest.resolve() for _, dest, _ in built}
    stale = [f for f in ROOT.glob("**/index.html") if f.resolve() not in made
             and not {"src", "tools", "assets", "node_modules"} & set(f.relative_to(ROOT).parts)
             and not any(x.startswith(".") for x in f.relative_to(ROOT).parts)]
    assert not stale, f"built pages without a source in src/pages: {stale}"
    for path, dest, size in built:
        print(f"{size / 1024:7.1f} KB  {dest.relative_to(ROOT)}")
    write_sitemap([p for p, _, _ in built])
    write_vercel()
    print("CSP boot hash:", boot_hash())
    return 0


if __name__ == "__main__":
    sys.exit(main())
