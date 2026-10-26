#!/bin/bash
# Usage: fetch.sh <url-list-file> <out-dir>
# Read-only GET of each URL with a 0.4 s pause. Appends to <out-dir>/index.tsv:
# url \t file \t http_code \t content_type \t size \t final_url
list="$1"; out="$2"
mkdir -p "$out/raw"
idx="$out/index.tsv"
touch "$idx"
while IFS= read -r url; do
  [ -z "$url" ] && continue
  if grep -q -F "$(printf '%s\t' "$url")" "$idx" 2>/dev/null; then continue; fi
  name=$(printf '%s' "$url" | sed -e 's|^https\?://||' -e 's|[^A-Za-z0-9._-]|_|g' | cut -c1-180)
  f="raw/$name"
  meta=$(curl -sS -L --max-redirs 3 --compressed -m 40 \
    -A "Mozilla/5.0 (compatible; ximi4ka-readonly-audit)" \
    -o "$out/$f" -w '%{http_code}\t%{content_type}\t%{size_download}\t%{url_effective}' "$url" 2>/dev/null)
  printf '%s\t%s\t%s\n' "$url" "$f" "$meta" >> "$idx"
  sleep 0.4
done < "$list"
