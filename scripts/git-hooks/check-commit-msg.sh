#!/bin/sh
# Commit-message policy: subject 10-72 chars, ASCII only, body lines limited to
# Co-Authored-By trailers. Skips merge/revert commits. Invoked by lefthook's
# commit-msg hook with the message file path as $1.
set -eu
MSG_FILE="$1"

# First non-blank, non-comment line = subject.
first_line=$(grep -v '^#' "$MSG_FILE" | sed '/^[[:space:]]*$/d' | head -1)
case "$first_line" in
  Merge*|Revert*|fixup!*|squash!*) exit 0 ;;
esac

# ASCII-only (no emoji / non-ASCII anywhere in the message).
if LC_ALL=C grep -q '[^ -~]' "$MSG_FILE"; then
  echo "commit-msg: non-ASCII characters are not allowed" >&2
  exit 1
fi

len=$(printf '%s' "$first_line" | wc -c | tr -d ' ')
if [ "$len" -lt 10 ] || [ "$len" -gt 72 ]; then
  echo "commit-msg: subject must be 10-72 chars (got $len): $first_line" >&2
  exit 1
fi

# Body: every non-blank, non-comment line after the subject must be a
# Co-Authored-By trailer.
body=$(grep -v '^#' "$MSG_FILE" | sed '1d' | sed '/^[[:space:]]*$/d')
if [ -n "$body" ]; then
  bad=$(printf '%s\n' "$body" | grep -v '^Co-Authored-By:' || true)
  if [ -n "$bad" ]; then
    echo "commit-msg: body may only contain Co-Authored-By trailers" >&2
    printf '  offending: %s\n' "$bad" >&2
    exit 1
  fi
fi
exit 0
