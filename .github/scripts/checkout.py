#!/usr/bin/env python3
"""Budget and materialize explicit Git inputs without fetching unrelated blobs."""
import argparse
import hashlib
import fnmatch
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request
import urllib.error
import time

CONTRACT = '.github/checkout.json'
_inventories = {}


def git(root, *args, data=None, no_fetch=False):
    env = dict(os.environ)
    if no_fetch:
        env['GIT_NO_LAZY_FETCH'] = '1'
    result = subprocess.run(['git', '-C', str(root), *args], input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if result.returncode:
        raise RuntimeError('git ' + args[0] + ': ' + result.stderr.decode(errors='replace').strip())
    return result.stdout


def load(root):
    config = json.loads((Path(root) / CONTRACT).read_text())
    if config.get('version') != 1 or not isinstance(config.get('profiles'), dict):
        raise ValueError('Invalid checkout contract')
    for name, profile in config['profiles'].items():
        if not re.fullmatch(r'[a-z][a-z0-9_-]*', name):
            raise ValueError('Invalid profile name')
        if not isinstance(profile.get('patterns'), list) or not profile['patterns']:
            raise ValueError('Profiles need explicit sparse patterns')
        for pattern in profile['patterns']:
            if (not isinstance(pattern, str) or not pattern.lstrip('!').startswith('/')
                    or any(c in pattern for c in '\r\n\0') or '..' in pattern.split('/')):
                raise ValueError('Invalid sparse pattern')
        for key in ('maxFiles', 'maxBytes'):
            if type(profile.get(key)) is not int or profile[key] <= 0:
                raise ValueError('Profiles need positive file and byte limits')
    return config


def entries(root):
    revision = git(root, 'rev-parse', 'HEAD').decode().strip()
    key = (str(Path(root).resolve()), revision)
    if key in _inventories:
        return _inventories[key]
    rows = []
    for raw in git(root, 'ls-tree', '-rz', revision).split(b'\0'):
        if not raw:
            continue
        metadata, path = raw.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        if kind == 'blob':
            rows.append({'path': os.fsdecode(path), 'oid': oid, 'mode': mode})
    oids = list(dict.fromkeys(row['oid'] for row in rows))
    raw = git(root, 'cat-file', '--batch-check=%(objectname) %(objectsize)',
              data=('\n'.join(oids) + '\n').encode(), no_fetch=True)
    sizes = {}
    for line in raw.decode().splitlines():
        oid, size = line.split()[:2]
        if size.isdigit():
            sizes[oid] = int(size)
    for row in rows:
        row['bytes'] = sizes.get(row['oid'])
    _inventories[key] = rows
    return rows


def selected(root, rows, patterns):
    with tempfile.TemporaryDirectory(prefix='checkout-rules-') as temp:
        rules = Path(temp) / 'rules'
        rules.write_text('\n'.join(patterns) + '\n')
        names = git(root, 'sparse-checkout', 'check-rules', '--no-cone', '--rules-file', str(rules), '-z',
                    data=b'\0'.join(os.fsencode(row['path']) for row in rows) + b'\0')
    wanted = set(os.fsdecode(p) for p in names.split(b'\0') if p)
    return [row for row in rows if row['path'] in wanted]


def remote_sizes(root, wanted):
    """Tree metadata supplies cold-clone sizes before any payload is fetched."""
    origin = git(root, 'remote', 'get-url', 'origin').decode().strip()
    match = re.search(r'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$', origin)
    tree = git(root, 'rev-parse', 'HEAD^{tree}').decode().strip()
    if not match:
        source = origin.removeprefix('file://')
        if not Path(source).exists():
            raise RuntimeError('Cannot establish cold checkout sizes for this remote')
        return {row['path']: row['bytes'] for row in entries(source)}
    repo = match.group(1)
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')

    def request(oid, recursive=True):
        endpoint = f'repos/{repo}/git/trees/{oid}' + ('?recursive=1' if recursive else '')
        for attempt in range(3):
            try:
                if token:
                    req = urllib.request.Request('https://api.github.com/' + endpoint,
                            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
                    with urllib.request.urlopen(req, timeout=20) as response:
                        return json.load(response)
                result = subprocess.run(['gh', 'api', endpoint], capture_output=True, text=True,
                                        env={**os.environ, 'GH_PROMPT_DISABLED': '1'}, timeout=30)
                if not result.returncode:
                    return json.loads(result.stdout)
                if not re.search(r'HTTP (?:5\d\d|429)|timed out|connection reset', result.stderr, re.I):
                    raise RuntimeError('GitHub tree-size lookup failed; authentication is required')
            except urllib.error.HTTPError as error:
                if error.code != 429 and error.code < 500:
                    raise RuntimeError(f'GitHub tree-size lookup failed (HTTP {error.code})') from None
            except (urllib.error.URLError, TimeoutError, subprocess.TimeoutExpired):
                pass
            if attempt < 2:
                time.sleep(attempt + 1)
        raise RuntimeError('GitHub tree-size lookup unavailable after three bounded attempts')

    sizes = {}

    def walk(oid, prefix=''):
        data = request(oid)
        if data.get('truncated'):
            # Never accept GitHub's truncated recursive inventory as complete.
            for item in request(oid, False)['tree']:
                path = prefix + item['path']
                if item['type'] == 'blob':
                    sizes[path] = item['size']
                elif item['type'] == 'tree' and any(p.startswith(path + '/') for p in wanted):
                    walk(item['sha'], path + '/')
        else:
            sizes.update({prefix + item['path']: item['size'] for item in data['tree'] if item['type'] == 'blob'})
    # Start shallow, so a source-only checkout never downloads a recursive
    # inventory of unrelated client/data trees merely to learn object sizes.
    for item in request(tree, False)['tree']:
        if item['type'] == 'blob':
            sizes[item['path']] = item['size']
        elif item['type'] == 'tree' and any(p.startswith(item['path'] + '/') for p in wanted):
            walk(item['sha'], item['path'] + '/')
    return sizes


def plan(root, profile, retained=(), contract=None):
    config = contract if contract is not None else load(root)
    if profile not in config['profiles']:
        raise ValueError('Unknown checkout profile: ' + profile)
    contract = config['profiles'][profile]
    patterns = list(dict.fromkeys(contract['patterns'] + list(retained)))
    inventory = entries(root)
    rows = selected(root, inventory, patterns)
    if len(rows) > contract['maxFiles']:
        raise RuntimeError(f'CHECKOUT_BUDGET: {len(rows)} files exceeds {contract["maxFiles"]}')
    missing = {row['path'] for row in rows if row['bytes'] is None}
    if missing:
        sizes = remote_sizes(root, missing)
        for row in inventory:
            if row['bytes'] is None:
                row['bytes'] = sizes.get(row['path'])
        if any(row['bytes'] is None for row in rows):
            raise RuntimeError('Incomplete tree-size inventory; checkout refused')
    total = sum(row['bytes'] for row in rows)
    if total > contract['maxBytes']:
        raise RuntimeError(f'CHECKOUT_BUDGET: {total} bytes exceeds {contract["maxBytes"]}; narrow declared inputs')
    return {'version': 1, 'revision': git(root, 'rev-parse', 'HEAD').decode().strip(),
            'profile': profile, 'patterns': patterns, 'files': len(rows), 'bytes': total,
            'limits': {k: contract[k] for k in ('maxFiles', 'maxBytes')}, 'paths': [r['path'] for r in rows]}


def delta(root):
    return hashlib.sha256(b'\0'.join([
        git(root, 'rev-parse', 'HEAD'), git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'),
        git(root, 'diff', '--binary', '--no-ext-diff'), git(root, 'diff', '--cached', '--binary', '--no-ext-diff')])).hexdigest()


def materialize(root, profile, preserve=False, contract=None):
    retained = []
    before = delta(root) if preserve else None
    if preserve:
        changed = b'\0'.join([git(root, 'diff', '--name-only', '-z'),
            git(root, 'diff', '--cached', '--name-only', '-z'),
            git(root, 'ls-files', '--others', '--exclude-standard', '-z')])
        retained = ['/' + re.sub(r'([\\*?\[])', r'\\\1', os.fsdecode(p)) for p in changed.split(b'\0') if p]
    proof = plan(root, profile, retained, contract)
    if git(root, 'rev-parse', 'HEAD').decode().strip() != proof['revision']:
        raise RuntimeError('Revision changed while planning checkout')
    old = git(root, 'sparse-checkout', 'list').decode().splitlines() if sparse(root) else None
    try:
        git(root, 'sparse-checkout', 'set', '--no-cone', '--stdin', data=('\n'.join(proof['patterns']) + '\n').encode())
        if not git(root, 'ls-files', '-z'):
            git(root, 'read-tree', '-mu', 'HEAD')
        actual = sum((Path(root) / path).lstat().st_size for path in proof['paths'])
        if actual > proof['limits']['maxBytes']:
            raise RuntimeError('Materialized checkout exceeds byte budget')
        if preserve and delta(root) != before:
            raise RuntimeError('Git delta changed while seeding native checkout defaults')
    except Exception:
        if old is None:
            git(root, 'sparse-checkout', 'disable')
        else:
            git(root, 'sparse-checkout', 'set', '--no-cone', '--stdin', data=('\n'.join(old) + '\n').encode())
        raise
    git(root, 'config', '--worktree', 'checkout.defaultsProfile', profile)
    if (contract if contract is not None else load(root)).get('adapter') == 'stoa':
        git(root, 'config', '--worktree', 'stoa.sparseProfile', 'agent-v2')
    proof.update(actualBytes=actual, preserved=preserve, deltaHash=before)
    proof.pop('paths')
    return proof


def sparse(root):
    try:
        return git(root, 'config', '--bool', 'core.sparseCheckout').decode().strip() == 'true'
    except RuntimeError:
        return False


def history(root, branch):
    if not re.fullmatch(r'[\w./-]+', branch) or branch.startswith('-') or '..' in branch:
        raise ValueError('Invalid history branch')
    args = ['fetch', '--no-tags', '--filter=blob:none']
    if git(root, 'rev-parse', '--is-shallow-repository').decode().strip() == 'true':
        args.append('--unshallow')
    git(root, *args, 'origin', f'+refs/heads/{branch}:refs/remotes/origin/{branch}')


def select(root):
    groups = load(root).get('groups', {})
    if not groups or any(not re.fullmatch(r'[a-z][a-z0-9_-]*', key) for key in groups):
        raise ValueError('Declare named check groups')
    chosen = set(groups)
    reason = 'complete run'
    base, head = os.environ.get('PR_BASE_SHA', ''), os.environ.get('PR_HEAD_SHA', '')
    if os.environ.get('GITHUB_EVENT_NAME') == 'pull_request' and all(re.fullmatch(r'[a-f0-9]{40}', s) for s in [base, head]):
        try:
            git(root, 'fetch', '--no-tags', '--filter=blob:none', '--depth=1', 'origin', base, head)
            files = [os.fsdecode(p) for p in git(root, 'diff', '--name-only', '--no-renames', '-z', base, head).split(b'\0') if p]
            chosen = set()
            for file in files:
                hit = {name for name, inputs in groups.items() if any(fnmatch.fnmatchcase(file, pattern) for pattern in inputs)}
                if not hit or file.startswith('.github/'):
                    chosen = set(groups)
                    reason = 'shared or unclassified input'
                    break
                chosen.update(hit)
            if not files:
                chosen = set(groups)
            reason = reason if len(chosen) == len(groups) else 'declared component inputs'
        except RuntimeError:
            chosen = set(groups)
            reason = 'comparison unavailable; complete coverage'
    proof = {'revision': git(root, 'rev-parse', 'HEAD').decode().strip(),
             'groups': {name: name in chosen for name in groups}, 'reason': reason}
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('selection=' + json.dumps(proof, separators=(',', ':')) + '\n')
            for name, active in proof['groups'].items():
                output.write(name + '=' + str(active).lower() + '\n')
    return proof


def verify_selection(root, selection, results):
    expected = set(load(root).get('groups', {}))
    if (not expected or set(selection.get('groups', {})) != expected
            or not any(selection['groups'].values())
            or any(type(active) is not bool for active in selection['groups'].values())
            or selection.get('revision') != git(root, 'rev-parse', 'HEAD').decode().strip()):
        raise RuntimeError('Missing or stale check selection')
    if results.get('plan', {}).get('result') != 'success':
        raise RuntimeError('Check planning did not succeed')
    for name, active in selection['groups'].items():
        result = results.get(name, {}).get('result')
        if result != 'success' and (active or result != 'skipped'):
            raise RuntimeError('Selected check did not pass: ' + name)
    return {'status': 'passed', 'revision': selection['revision'], 'groups': selection['groups']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'materialize', 'seed', 'history', 'audit', 'select', 'verify-selection'])
    parser.add_argument('--root', default='.')
    parser.add_argument('--profile', default='agent')
    parser.add_argument('--branch', default='main')
    parser.add_argument('--output')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if args.command == 'select':
        proof = select(root)
    elif args.command == 'verify-selection':
        proof = verify_selection(root, json.loads(os.environ['SELECTION']), json.loads(os.environ['RESULTS']))
    elif args.command == 'audit':
        proof = []
        for name in load(root)['profiles']:
            item = plan(root, name)
            item.pop('paths')
            proof.append(item)
    elif args.command == 'history':
        history(root, args.branch)
        proof = {'history': args.branch, 'shallow': False}
    elif args.command == 'plan':
        proof = plan(root, args.profile)
        proof.pop('paths')
    else:
        proof = materialize(root, args.profile, args.command == 'seed')
    encoded = json.dumps(proof, indent=2) + '\n'
    if args.output:
        Path(args.output).write_text(encoded)
    print(encoded, end='')


if __name__ == '__main__':
    main()
