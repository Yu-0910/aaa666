from pathlib import Path
import re

layout_path = Path("app/layout.tsx")
css_path = Path("app/globals.css")

layout = layout_path.read_text(encoding="utf-8")
backup = layout_path.with_suffix(".tsx.bak_disable_google_fonts")
backup.write_text(layout, encoding="utf-8")

# next/font/google import を削除
layout = re.sub(
    r'^\s*import\s+\{[^}]*\}\s+from\s+["\']next/font/google["\']\s*\n',
    '',
    layout,
    flags=re.MULTILINE,
)

# _inter / _notoSansJP / _bebasNeue の const ブロックを削除
for name in ["_inter", "_notoSansJP", "_bebasNeue"]:
    layout = re.sub(
        rf'\nconst\s+{name}\s*=\s*[A-Za-z_][A-Za-z0-9_]*\(\{{[\s\S]*?\n\}}\)\n',
        '\n',
        layout,
        count=1,
    )

# fonts.googleapis を含む head ブロックだけ削除
layout = re.sub(
    r'\n\s*<head>[\s\S]*?fonts\.googleapis\.com[\s\S]*?</head>\s*',
    '\n',
    layout,
    count=1,
)

# body className から font variable を除去
layout = re.sub(
    r'className=\{`font-sans antialiased[^`]*`\}',
    'className="font-sans antialiased"',
    layout,
)

# 万一残った変数参照を除去
layout = layout.replace('${_inter.variable}', '')
layout = layout.replace('${_notoSansJP.variable}', '')
layout = layout.replace('${_bebasNeue.variable}', '')

layout_path.write_text(layout, encoding="utf-8")

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
if marker not in css:
    css = css.rstrip() + "\n\n" + fallback.lstrip()
    css_path.write_text(css, encoding="utf-8")

print(f"patched: {layout_path}")
print(f"backup: {backup}")
