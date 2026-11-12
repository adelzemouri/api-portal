#!/usr/bin/env python3
"""Injecte le Design System (directions graphiques + sélecteur) dans un export statique du portail.

Usage : python3 tools/build-preview.py <export.html> <sortie.html>

L'export n'est pas modifié ailleurs : on ajoute un <style> et un <script> en fin de <head>.
Les polices sont embarquées en base64 pour que le fichier reste autonome (ouverture en file://).
"""
import base64, pathlib, re, sys

here = pathlib.Path(__file__).resolve().parent.parent
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])

def inline_fonts(css: str) -> str:
    def repl(m):
        data = base64.b64encode((here / m.group(1)).read_bytes()).decode()
        return f'url("data:font/woff2;base64,{data}")'
    return re.sub(r'url\("(fonts/[^"]+)"\)', repl, css)

def inline_art(css: str) -> str:
    def repl(m):
        data = base64.b64encode((here / m.group(1)).read_bytes()).decode()
        return f'url("data:image/svg+xml;base64,{data}")'
    return re.sub(r'url\("(art/[^"]+\.svg)"\)', repl, css)

css = inline_fonts((here / "design-fonts.css").read_text(encoding="utf-8"))
for name in ("design-tokens.css", "design-components.css", "design-layouts.css", "design-motion.css"):
    css += "\n" + inline_art((here / name).read_text(encoding="utf-8"))
js = "\n".join((here / n).read_text(encoding="utf-8") for n in ("design-switcher.js", "design-motion.js")).replace("</script", "<\\/script")

html = src.read_text(encoding="utf-8")
block = f'<style id="design-system">\n{css}\n</style>\n<script id="design-switcher-script">\n{js}\n</script>\n'
# Le premier </head> du fichier peut appartenir à un document embarqué en JSON : on vise celui qui précède <body>.
i = re.search(r"</head>\s*<body", html).start()
out.write_text(html[:i] + block + html[i:], encoding="utf-8")
print(f"{out} : {out.stat().st_size / 1e6:.1f} Mo")
