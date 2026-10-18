#!/usr/bin/env python3
"""Insert the native archive route without rewriting unrelated Caddy bytes."""
from pathlib import Path
import argparse
import re

MARKER = '  # Native releases: independent immutable directory, missing files never cached.\n'

def route(workspace):
    # An explicit route preserves order: existing archive, then uncached fallback.
    return MARKER + '''  @nativePath path /native /native/*
  handle @nativePath {
   route {
    root * WORKSPACE
    @nativeRelease {
     path_regexp nativeRelease "^/native/releases/[a-f0-9]{64}/[a-zA-Z0-9][a-zA-Z0-9._-]*[.](zip|apk)$"
     file {path}
    }
    handle @nativeRelease {
     header Cache-Control "public, max-age=31536000, immutable"
     file_server
    }
    handle {
     header Cache-Control "no-store"
     respond 404
    }
   }
  }
'''.replace('WORKSPACE', workspace)

def patch(text, host, workspace):
    if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?', host):
        raise ValueError('Invalid game host')
    if not re.fullmatch(r'/[A-Za-z0-9._/-]+', workspace) or '..' in workspace.split('/') or workspace == '/':
        raise ValueError('Invalid server workspace')
    start = re.search(r'^' + re.escape(host) + r' \{\n', text, re.M)
    if not start:
        raise ValueError('Expected game host not found')
    end = re.search(r'^}\n?', text[start.end():], re.M)
    if not end:
        raise ValueError('Expected game block not closed')
    stop = start.end() + end.end()
    block = text[start.start():stop]
    replacement = route(workspace.rstrip('/'))
    if MARKER in block:
        if block.count(replacement) != 1:
            raise ValueError('Existing native route differs; manual review required')
        return text
    anchor = '  @admin path /admin /admin/*\n'
    if block.count(anchor) != 1:
        raise ValueError('Unexpected game admin anchor')
    block = block.replace(anchor, replacement + anchor)
    return text[:start.start()] + block + text[stop:]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--host', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    before = args.file.read_text()
    after = patch(before, args.host, args.workspace)
    if args.check:
        print('unchanged' if after == before else 'would-change')
    elif before == after:
        print('unchanged')
    else:
        args.file.write_text(after)
        print('changed')
