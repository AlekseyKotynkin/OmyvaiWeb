import re
import os
from html import escape

ROOT = os.path.join(os.getcwd(), 'my-public')
files = ['index.html','bonus.html','help.html']

issues = []
fixes = []

img_re = re.compile(r"<img\s+([^>]+)>", re.I)
alt_re = re.compile(r'alt\s*=\s*([\"\']).*?\1', re.I)

for fn in files:
    path = os.path.join(ROOT, fn)
    if not os.path.exists(path):
        issues.append((fn, 'missing file'))
        continue
    with open(path, 'r', encoding='utf-8') as f:
        s = f.read()

    # Count H1
    h1_count = len(re.findall(r'<h1\b', s, re.I))
    if h1_count == 0:
        issues.append((fn, 'missing H1'))
    elif h1_count > 1:
        issues.append((fn, f'multiple H1 ({h1_count})'))

    # Images without alt
    for m in img_re.finditer(s):
        attrs = m.group(1)
        if not alt_re.search(attrs):
            # compute a reasonable alt from src if available
            src_m = re.search(r'src\s*=\s*([\"\'])(.*?)\1', attrs, re.I)
            alt_text = ''
            if src_m:
                src = os.path.basename(src_m.group(2))
                alt_text = os.path.splitext(src)[0].replace('-', ' ').replace('_',' ')
            if not alt_text:
                alt_text = 'Изображение'
            issues.append((fn, f'missing alt for image: {m.group(0)[:80]}'))
            # prepare fix: insert alt attribute before closing
            new_img = m.group(0)
            if new_img.endswith('/>'):
                new_img_fixed = new_img[:-2] + f' alt="{escape(alt_text)}"/>'
            else:
                new_img_fixed = new_img[:-1] + f' alt="{escape(alt_text)}">'
            s = s[:m.start()] + new_img_fixed + s[m.end():]
            fixes.append((fn, m.group(0), new_img_fixed))

    if fixes and fixes[-1][0] == fn:
        # write back incrementally
        with open(path, 'w', encoding='utf-8') as f:
            f.write(s)

# Print results
print('ISSUES FOUND:')
for it in issues:
    print('-', it[0], ':', it[1])

print('\nAUTOMATIC FIXES APPLIED:')
for fx in fixes:
    print('-', fx[0], ': replaced', fx[1][:60], '->', fx[2][:60])

if not issues and not fixes:
    print('No issues found.')
