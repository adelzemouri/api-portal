#!/usr/bin/env python3
"""Génère les illustrations de fond des tuiles du design B (Graphite Premium).

Usage : python3 tools/build-art.py        (écrit art/<nom>-<light|dark>.svg)

Dessins originaux, purement vectoriels, sans texte ni police : des « objets » posés en biais
(plaque à coins ronds, tournée mais jamais cisaillée, tranche, reflet) portant un pictogramme en rapport avec la tuile.
Une variante par atmosphère, car une image de fond ne peut pas lire les tokens CSS.
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "art"

PALETTES = {
    "dark": dict(top="#3b3b3b", bottom="#1d1d1d", side="#0c0c0c", edge="#565656", back_top="#2a2a2a", back_bottom="#171717",
                 ink="#8f8f8f", ink_soft="#4a4a4a", well="#151515", shadow="#000000", shadow_op="0.4", fade="0.5",
                 accent="#f2b632", ok="#3ecf8e", err="#f2766e", gloss="0.10"),
    "light": dict(top="#ffffff", bottom="#ece9e3", side="#cfcbc2", edge="#d2cfc8", back_top="#f6f4f0", back_bottom="#e4e0d8",
                  ink="#7a7d83", ink_soft="#c9c5bc", well="#f0eee9", shadow="#18191b", shadow_op="0.1", fade="0.6",
                  accent="#e2600f", ok="#1a8f5c", err="#c8372f", gloss="0.9"),
}

W, H = 132, 84  # plaque, en coordonnées locales


def server(p):
    rows = ""
    for i, led in enumerate((p["ok"], p["err"], p["ink_soft"])):
        y = 11 + i * 22
        rows += (f'<rect x="12" y="{y}" width="108" height="16" rx="4" fill="{p["well"]}"/>'
                 f'<rect x="20" y="{y + 6}" width="34" height="4" rx="2" fill="{p["ink_soft"]}"/>'
                 f'<circle cx="110" cy="{y + 8}" r="3" fill="{led}"/>')
    return rows


def gauge(p):
    return (f'<path d="M30 62 A36 36 0 0 1 102 62" fill="none" stroke="{p["ink_soft"]}" stroke-width="6" stroke-linecap="round"/>'
            f'<path d="M30 62 A36 36 0 0 1 91.5 36.5" fill="none" stroke="{p["accent"]}" stroke-width="6" stroke-linecap="round"/>'
            f'<line x1="66" y1="62" x2="86" y2="41" stroke="{p["ink"]}" stroke-width="3" stroke-linecap="round"/>'
            f'<circle cx="66" cy="62" r="5" fill="{p["ink"]}"/>')


def routes(p):
    out = ""
    for y, c in ((18, p["ink_soft"]), (42, p["ok"]), (66, p["ink_soft"])):
        out += (f'<path d="M30 42 C62 42 66 {y} 100 {y}" fill="none" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/>'
                f'<circle cx="106" cy="{y}" r="6" fill="{p["well"]}" stroke="{c}" stroke-width="2.5"/>')
    return out + f'<circle cx="24" cy="42" r="9" fill="{p["ink"]}"/>'


def lock(p):
    dots = "".join(f'<circle cx="{74 + i * 13}" cy="50" r="3.5" fill="{p["accent"] if i < 3 else p["ink_soft"]}"/>' for i in range(4))
    return (f'<path d="M26 40 V31 a12 12 0 0 1 24 0 V40" fill="none" stroke="{p["ink"]}" stroke-width="4" stroke-linecap="round"/>'
            f'<rect x="18" y="39" width="40" height="30" rx="6" fill="{p["ink"]}"/>'
            f'<circle cx="38" cy="52" r="4" fill="{p["well"]}"/><rect x="36.5" y="52" width="3" height="9" rx="1.5" fill="{p["well"]}"/>'
            f'<rect x="68" y="38" width="52" height="24" rx="6" fill="{p["well"]}"/>{dots}')


def braces(p):
    brace = "M{a} 20 q-8 0 -8 8 v6 q0 8 -7 8 q7 0 7 8 v6 q0 8 8 8"
    left = brace.format(a=34)
    return (f'<path d="{left}" fill="none" stroke="{p["ink"]}" stroke-width="3.5" stroke-linecap="round"/>'
            f'<path d="{left}" transform="translate(132 0) scale(-1 1)" fill="none" stroke="{p["ink"]}" stroke-width="3.5" stroke-linecap="round"/>'
            f'<path d="M66 60 V27 M54 38 L66 26 L78 38" fill="none" stroke="{p["accent"]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')


def link(p):
    return (f'<rect x="20" y="28" width="56" height="28" rx="14" fill="none" stroke="{p["ink"]}" stroke-width="5"/>'
            f'<rect x="56" y="28" width="56" height="28" rx="14" fill="none" stroke="{p["accent"]}" stroke-width="5"/>'
            f'<path d="M62 28 H48 a14 14 0 0 0 0 28" fill="none" stroke="{p["ink"]}" stroke-width="5" stroke-linecap="round"/>')


def lines(p):
    return "".join(f'<rect x="14" y="{16 + i * 13}" width="{w}" height="4" rx="2" fill="{p["ink_soft"]}"/>' for i, w in enumerate((70, 96, 52, 84, 40)))


def plate(p, uid, glyph, back=False):
    top, bottom = (p["back_top"], p["back_bottom"]) if back else (p["top"], p["bottom"])
    return (f'<rect y="5" width="{W}" height="{H}" rx="11" fill="{p["side"]}"/>'
            f'<rect width="{W}" height="{H}" rx="11" fill="url(#{uid})" stroke="{p["edge"]}" stroke-width="1"/>'
            f'<path d="M11 0.5 H{W - 11}" stroke="#ffffff" stroke-opacity="{p["gloss"]}" stroke-linecap="round"/>'
            f'{glyph}'), (top, bottom)


def svg(p, glyph, back_glyph):
    front, (ft, fb) = plate(p, "f", glyph)
    back, (bt, bb) = plate(p, "b", back_glyph, back=True)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 170">'
            f'<defs>'
            f'<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{ft}"/><stop offset="1" stop-color="{fb}"/></linearGradient>'
            f'<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bt}"/><stop offset="1" stop-color="{bb}"/></linearGradient>'
            f'<filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="{p["shadow"]}" flood-opacity="{p["shadow_op"]}"/></filter>'
            f'</defs>'
            # Rotation seule, sans cisaillement : chaque coin reste à angle droit.
            # Opacité d'ensemble réduite : l'illustration reste un fond, derrière le contenu.
            f'<g opacity="{p["fade"]}">'
            f'<g transform="translate(78 22) rotate(8)" filter="url(#s)" opacity="0.85">{back}</g>'
            f'<g transform="translate(30 62) rotate(-9)" filter="url(#s)">{front}</g>'
            f'</g>'
            f'</svg>\n')


ART = {"errors": (server, lines), "latency": (gauge, lines), "calls": (routes, lines),
       "auth": (lock, lines), "deploy": (braces, lines), "connect": (link, lines)}

OUT.mkdir(exist_ok=True)
for theme, p in PALETTES.items():
    for name, (glyph, back) in ART.items():
        (OUT / f"{name}-{theme}.svg").write_text(svg(p, glyph(p), back(p)), encoding="utf-8")
print(f"{len(ART) * len(PALETTES)} illustrations écrites dans {OUT}")
