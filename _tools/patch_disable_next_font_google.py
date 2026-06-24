from pathlib import Path
import re

layout_path = Path("app/layout.tsx")
css_path = Path("app/globals.css")

layout = layout_path.read_text(encoding="utf-8")
original_layout = layout

# next/font/google の import を削除
layout = re.sub(
    r'^\s*import\s+\{[^}]*\}\s+from\s+["\']next/font/google["\']\s*\n',
    '',
    layout,
    flags=re.MULTILINE,
)

# const _inter / _notoSansJP / _bebasNeue の next/font 定義を削除
for name in ["_inter", "_notoSansJP", "_bebasNeue"]:
    layout = re.sub(
        rf'\nconst {name}\s*=\s*[A-Za-z_][A-Za-z0-9_]*\(\{{[\s\S]*?\n\}}\)\n',
        '\n',
        layout,
        count=1,
    )

# Google Fonts の <head> リンクを削除
layout = re.sub(
    r'\n\s*<head>\s*\n\s*\{/\*[\s\S]*?\*/\}\s*\n\s*<link\s+href="https://fonts\.googleapis\.com[^"]*"\s+rel="stylesheet"\s*/>\s*\n\s*</head>',
    '',
    layout,
    count=1,
)

# body className から next/font の variable を削除
layout = layout.replace(
    'className={`font-sans antialiased ${_inter.variable} ${_notoSansJP.variable} ${_bebasNeue.variable}`}',
    'className="font-sans antialiased"',
)

if layout == original_layout:
    print("layout: no changes")
else:
    layout_path.write_text(layout, encoding="utf-8")
    print(f"patched: {layout_path}")

css = css_path.read_text(encoding="utf-8")
marker = "/* build-offline font variable fallbacks */"

fallback = '''
/* build-offline font variable fallbacks */
:root {
  --font-inter: "Inter", "Segoe UI", Arial, sans-serif;
  --font-noto-sans-jp: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
  --font-bebas-neue: "Bebas Neue", "Arial Narrow", Arial, sans-serif;
}
'''

if marker in css:
    print("globals.css: fallback already exists")
else:
    css = css.rstrip() + "\\n\\n" + fallback.lstrip()
    css_path.write_text(css, encoding="utf-8")
    print(f"patched: {css_path}")
