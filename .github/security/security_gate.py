#!/usr/bin/env python3
"""Fail-closed checks for the reviewed static guest-site payload.

No package installation, application execution, account mutation or deployment.
This gate is a regression barrier, not a substitute for browser security review.
"""
import argparse
import base64
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from html.parser import HTMLParser


class GateError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise GateError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.policies, self.errors, self.script_bodies = [], [], []
        self.active_script = None
        self.stack = []
        self.head_seen = False
        self.invalid_head_prefix = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            if self.head_seen or (self.stack and self.stack[-1] != 'html'):
                self.invalid_head_prefix = True
            self.head_seen = True
        elif not self.policies:
            if not self.head_seen and tag != 'html':
                self.invalid_head_prefix = True
            if 'head' in self.stack and tag != 'meta':
                self.invalid_head_prefix = True
        if not self.policies and tag == 'html' and self.stack:
            self.invalid_head_prefix = True
        if not self.policies and tag == 'meta' and attrs.get('http-equiv', '').lower() != 'content-security-policy' and attrs.get('charset', '').lower() not in {'utf-8', 'utf8'}:
            self.invalid_head_prefix = True
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            if not self.stack or self.stack[-1] != 'head' or 'template' in self.stack or self.invalid_head_prefix:
                self.errors.append('CSP meta is not a direct child of head')
            self.policies.append(attrs.get('content', ''))
        if tag == 'script':
            if not self.policies:
                self.errors.append('script before CSP')
            kind = attrs.get('type', '').lower()
            executable = kind not in {'application/json', 'application/ld+json'}
            self.active_script = {'body': '', 'external': bool(attrs.get('src')), 'executable': executable}
        for key, value in attrs.items():
            if key.lower().startswith('on') and value:
                self.errors.append('inline event handler')
            if key in {'href', 'src', 'action', 'formaction'} and value and re.match(r'\s*javascript:', value, re.I):
                self.errors.append('executable URL scheme')
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if not self.policies and tag not in {'meta'}:
            self.invalid_head_prefix = True
        self.handle_starttag(tag, attrs)
        if tag in self.stack:
            self.handle_endtag(tag)

    def handle_comment(self, data):
        if not self.policies:
            self.invalid_head_prefix = True

    def handle_decl(self, decl):
        if not self.policies and (decl.lower().strip() != 'doctype html' or self.stack):
            self.invalid_head_prefix = True

    def handle_pi(self, data):
        if not self.policies:
            self.invalid_head_prefix = True

    def unknown_decl(self, data):
        if not self.policies:
            self.invalid_head_prefix = True

    def handle_data(self, data):
        if not self.policies and data.strip(' \t\n\r\f') and (not self.stack or self.stack[-1] in {'html','head'}):
            self.invalid_head_prefix = True
        if self.active_script is not None:
            self.active_script['body'] += data

    def handle_endtag(self, tag):
        if not self.policies and 'head' in self.stack and self.stack[-1] != tag:
            self.invalid_head_prefix = True
        if tag == 'script' and self.active_script is not None:
            self.script_bodies.append(self.active_script)
            self.active_script = None
        if tag in self.stack:
            del self.stack[len(self.stack) - 1 - self.stack[::-1].index(tag):]


def check_html(text, name):
    page = Page()
    page.feed(text)
    require(not page.errors, name + ': ' + ', '.join(sorted(set(page.errors))))
    require(len(page.policies) == 1, name + ': exactly one CSP is required')
    directives = {}
    for part in page.policies[0].split(';'):
        values = part.strip().split()
        if values:
            require(values[0] not in directives, name + ': duplicate CSP directive')
            directives[values[0]] = values[1:]
    for key in ['default-src', 'script-src', 'object-src', 'base-uri', 'connect-src', 'form-action']:
        require(key in directives, name + ': missing CSP ' + key)
    require(directives['object-src'] == ["'none'"], name + ': object-src must deny objects')
    require(directives['base-uri'] in [["'none'"], ["'self'"]], name + ': unsafe base-uri')
    for key in ['script-src', 'script-src-elem', 'script-src-attr', 'connect-src', 'form-action']:
        if key not in directives:
            continue
        values = directives[key]
        require(not any(v in values for v in ["'unsafe-eval'", "'unsafe-inline'", '*', 'data:', 'http:', 'https:']), name + ': broad ' + key)
        require(not any(v.startswith("'nonce-") for v in values), name + ': static nonce in published HTML')
    for script in page.script_bodies:
        if script['external'] or not script['executable'] or not script['body'].strip():
            continue
        body = script['body'].replace('\r\n', '\n').replace('\r', '\n').encode()
        accepted = ["'" + alg + '-' + base64.b64encode(hashlib.new(alg, body).digest()).decode() + "'" for alg in ['sha256', 'sha384', 'sha512']]
        require(any(h in directives.get('script-src-elem', directives['script-src']) for h in accepted), name + ': unapproved inline script')


SECRET_PATTERNS = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b'),
    'aws-access-key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'slack-token': re.compile(rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
}
EXTENSIONS = {'.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.txt', '.xml', '.webmanifest', '.mp4', '.webm'}


def payload_files(root, config):
    result = {}
    for scope in config['include']:
        declared = pathlib.PurePosixPath(scope)
        require(not declared.is_absolute() and '..' not in declared.parts, 'Unsafe publication scope')
        p = root / scope
        require(p.exists(), 'Missing publication scope: ' + scope)
        require(not p.is_symlink(), 'Symlink publication scope: ' + scope)
        entries = sorted(p.rglob('*')) if p.is_dir() else [p]
        for item in entries:
            relative = item.relative_to(root).as_posix()
            parts = item.relative_to(root).parts
            if any(x in {'.git', '.github', '__pycache__'} for x in parts):
                continue
            require(not item.is_symlink(), 'Symlink in payload: ' + relative)
            if not item.is_file():
                continue
            if item.name == '.DS_Store':
                continue
            require(not any(x.startswith('.') for x in parts) or relative == '.nojekyll', 'Hidden payload file: ' + relative)
            require(item.suffix.lower() in EXTENSIONS or item.name == '.nojekyll', 'Unexpected payload type: ' + relative)
            require(not any(x.lower() in {'qa', 'docs', 'tests', 'node_modules'} for x in parts), 'Service directory in payload: ' + relative)
            result[relative] = item
    for path in config['required_files']:
        require(path in result, 'Required public file missing: ' + path)
    return result


def request_json(url, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'User-Agent': 'park-site-security-gate/1', 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        require(response.status == 200, 'Advisory source did not return 200')
        return json.load(response)


def active_advisories(response):
    require(isinstance(response, dict), 'Malformed OSV response')
    records = response.get('vulns', [])
    require(isinstance(records, list), 'Malformed OSV vulnerabilities')
    return [x.get('id', 'unknown') for x in records if not x.get('withdrawn')]


def dependency_check(root, config, online=True, fixture=None):
    results = []
    for component in config['components']:
        path = component.get('path')
        if path:
            raw = (root / path).read_bytes()
            require(digest(raw) == component['sha256'], 'Dependency bytes changed: ' + path)
            for bundle in component.get('embedded_in', []):
                require(raw in (root / bundle).read_bytes(), 'Bundle no longer includes verified dependency: ' + bundle)
        query = {'version': component['version'], 'package': {'name': component['name'], 'ecosystem': component['ecosystem']}}
        response = fixture if fixture is not None else (request_json('https://api.osv.dev/v1/query', query) if online else {})
        found = active_advisories(response)
        require(not found, 'Active advisory for ' + component['name'] + ': ' + ', '.join(found))
        results.append({'name': component['name'], 'version': component['version'], 'status': 'PASS' if online or fixture is not None else 'NOT_QUERIED', 'source': 'https://api.osv.dev/v1/query'})
    return results


def check(root, config, online=True):
    workflow_files = sorted((root / '.github/workflows').glob('*.y*ml'))
    require(workflow_files, 'No protected publishing workflow')
    allowed = {x['name'] + '@' + x['sha'] for x in config['components'] if x['ecosystem'] == 'GitHub Actions'}
    for workflow in workflow_files:
        source = workflow.read_text()
        require(not re.search(r'^\s+(pull_request_target|workflow_run)\s*:', source, re.M), 'Privileged untrusted trigger: ' + workflow.name)
        for ref in re.findall(r'^\s*(?:-\s*)?uses:\s*[\'"]?([^\s\'"#]+)', source, re.M):
            require(ref in allowed, 'Action is not in the reviewed SHA allowlist: ' + ref)
    files = payload_files(root, config)
    html_files = [n for n in files if n.endswith('.html')]
    require(len(html_files) >= config['min_html_count'], 'HTML inventory unexpectedly shrank')
    for relative, path in files.items():
        raw = path.read_bytes()
        for kind, expression in SECRET_PATTERNS.items():
            require(not expression.search(raw), 'Recognizable secret pattern: ' + relative + ' [' + kind + ']')
        if relative.endswith('.html'):
            check_html(raw.decode('utf-8'), relative)
        if relative.endswith('.js'):
            syntax = subprocess.run(['node', '--check', str(path)], capture_output=True)
            require(syntax.returncode == 0, 'JavaScript syntax error: ' + relative)
        if relative.endswith('.json'):
            try:
                json.loads(raw)
            except (ValueError, UnicodeError):
                raise GateError('Invalid public JSON: ' + relative)
    deps = dependency_check(root, config, online)
    manifest = [{'path': n, 'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size} for n, p in sorted(files.items())]
    return {'status': 'PASS', 'html_count': len(html_files), 'file_count': len(files), 'dependencies': deps, 'files': manifest, 'limits': ['Pattern scan is not a guarantee that no secret exists.', 'Static checks do not replace browser scenario and trust-boundary review.', 'HTTP headers and same-origin isolation are outside this local gate.']}


def package(root, report, destination):
    require(not destination.exists(), 'Archive destination already exists')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(destination, 'w', format=tarfile.PAX_FORMAT) as archive:
        for entry in report['files']:
            data = (root / entry['path']).read_bytes()
            require(digest(data) == entry['sha256'], 'Payload changed between verification and packaging')
            info = tarfile.TarInfo('./' + entry['path'])
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(destination) as archive:
        require(all(x.isfile() for x in archive.getmembers()), 'Archive contains nonregular entry')
    return {'path': str(destination), 'sha256': digest(destination.read_bytes()), 'files': len(report['files'])}


def monitor(root, config):
    results = []
    for route in config['monitor']:
        expected = (root / route['file']).read_bytes()
        url = config['public_base'] + route['url']
        request = urllib.request.Request(url, headers={'User-Agent': 'park-site-availability/1', 'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            actual = response.read()
            require(response.status == 200 and response.geturl() == url, 'Unexpected HTTP result: ' + url)
            require(digest(actual) == digest(expected), 'Public response differs from protected branch: ' + route['file'])
            require(response.headers.get('Strict-Transport-Security'), 'HSTS missing: ' + url)
            results.append({'url': url, 'status': response.status, 'sha256': digest(actual)})
    return {'status': 'PASS', 'responses': results, 'notification_delivery': 'NOT_VERIFIED'}


def self_test():
    policy = "default-src 'none'; script-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'none'"
    good = '<html><head><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script src="app.js"></script></head><body>Demo</body></html>'
    tests = []
    check_html(good, 'valid-fixture')
    tests.append({'case': 'valid CSP fixture', 'expected': 'accept', 'actual': 'accept'})
    for name, bad in [('missing CSP', '<html><script src="app.js"></script></html>'), ('script before CSP', '<script src="app.js"></script>' + good), ('broad script policy', good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")), ('unapproved inline script', good.replace('<script src="app.js"></script>', '<script>const fixture = 1;</script>')), ('CSP in body', '<html><head></head><body><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script src="app.js"></script></body></html>'), ('CSP in template', good.replace('<head>', '<head><template>').replace('</head>', '</template></head>')), ('implicit head close', good.replace('<head>', '<head><div>Demo</div>')), ('text closes head', good.replace('<head>', '<head>Demo')), ('repeated head', good.replace('<head>', '<head></head><head>')), ('body token before head', good.replace('<head>', '<div>Demo</div><head>')), ('unexpected head end token', good.replace('<head>', '<head></body>')), ('character reference closes head', good.replace('<head>', '<head>&#65;')), ('nonvoid self closing', good.replace('<head>', '<head><style/>')), ('resource before policy', good.replace('<head>', '<head><link rel="stylesheet" href="style.css">')), ('comment before policy', good.replace('<head>', '<head><!-- prefix -->')), ('non ASCII head whitespace', good.replace('<head>', '<head>&nbsp;'))]:
        try:
            check_html(bad, name)
        except GateError:
            tests.append({'case': name, 'expected': 'reject', 'actual': 'reject'})
        else:
            raise GateError('Negative fixture was accepted: ' + name)
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp)
        (root/'index.html').write_text(good)
        (root/'app.js').write_text('const fixture = 1;')
        (root/'legacy').mkdir()
        (root/'legacy'/'private.txt').write_text('fixture only')
        config = {'include': ['index.html', 'app.js'], 'required_files': ['index.html'], 'min_html_count': 1, 'components': [{'name':'fixture','version':'1','ecosystem':'npm'}]}
        (root / '.github/workflows').mkdir(parents=True)
        (root / '.github/workflows/fixture.yml').write_text('name: Fixture\non: push\njobs: {}\n')
        require('legacy/private.txt' not in payload_files(root, config), 'Allowlist leaked excluded fixture')
        tests.append({'case': 'publication allowlist', 'expected': 'exclude legacy fixture', 'actual': 'excluded'})
        try:
            dependency_check(root, config, fixture={'vulns':[{'id':'TEST-ADVISORY-CANARY'}]})
        except GateError:
            tests.append({'case': 'advisory fixture', 'expected': 'reject', 'actual': 'reject'})
        else:
            raise GateError('Advisory fixture was accepted')
        report = check(root, config, online=False)
        tar = root / 'fixture.tar'
        package(root, report, tar)
        with tarfile.open(tar) as archive:
            expected = {x['path']: x['sha256'] for x in report['files']}
            actual = {x.name.removeprefix('./'): digest(archive.extractfile(x).read()) for x in archive.getmembers()}
            require(actual == expected, 'Archive differs from checked manifest')
        tests.append({'case':'packaged bytes and inventory','expected':'match verified manifest','actual':'match'})
    return {'status':'PASS','cases':tests}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['build', 'check', 'monitor', 'self-test'])
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path('.'))
    parser.add_argument('--config', type=pathlib.Path, default=pathlib.Path('.github/security/config.json'))
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--archive', type=pathlib.Path)
    parser.add_argument('--offline', action='store_true', help='Local diagnostics only. Never used by publishing workflows.')
    args = parser.parse_args()
    try:
        if args.command == 'self-test':
            result = self_test()
        else:
            root = args.root.resolve()
            config = json.loads(args.config.read_text())
            if args.command == 'monitor':
                result = monitor(root, config)
            else:
                result = check(root, config, not args.offline)
                if args.offline:
                    result['status'] = 'LOCAL_STATIC_PASS_ADVISORIES_NOT_CHECKED'
                if args.command == 'build':
                    require(not args.offline, 'Offline checks cannot produce publication artifact')
                    require(args.archive is not None, '--archive is required for build')
                    result['archive'] = package(root, result, args.archive)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({k:v for k,v in result.items() if k != 'files'}, ensure_ascii=False))
    except (GateError, OSError, ValueError, urllib.error.URLError) as error:
        print(json.dumps({'status':'FAIL','reason':str(error)}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
