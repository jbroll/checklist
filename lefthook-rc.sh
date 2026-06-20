# Sourced by lefthook before every command (see `rc:` in lefthook.yml).
# Sets ORG_HOOKS so scripts from the org-hooks remote configs resolve.
export ORG_HOOKS=/home/john/src/org-hooks
# Pull org-wide hook env defaults (LEFTHOOK_OUTPUT, etc.). Each uses := —
# override by exporting before this line.
. "$ORG_HOOKS/rc.sh"
