"""Stage the runtime files for a Cloudflare Pages deployment.

Deploying the repository root would upload node_modules (32 MB), the test
suite, the CI scripts and other development-only files. This copies just what
the browser actually needs:

    index.html  styles.css  sw.js  manifest.json  icons/  js/  vendor/

Run via `npm run deploy:stage`, then `npm run deploy`.
"""
import io
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = os.path.join(ROOT, '.deploy')

ITEMS = ['index.html', 'styles.css', 'sw.js', 'manifest.json', 'robots.txt',
         'icons', 'js', 'vendor', 'THIRD_PARTY.md']

# robots.txt is included deliberately. Without it, the host's SPA fallback
# answers /robots.txt with index.html as text/html, which crawlers reject —
# Lighthouse flagged it as "robots.txt is not valid".

# Keep attribution for the vendored CAS reachable from the deployed site.
# Nothing here is a secret, but the deployment stays limited to what is needed
# to run the app.


def main():
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE)

    for name in ITEMS:
        src = os.path.join(ROOT, name)
        if not os.path.exists(src):
            print('MISSING: %s' % name)
            continue
        dest = os.path.join(STAGE, name)
        if os.path.isdir(src):
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)

    # icons/make_icons.py is a generator, not something the app loads.
    stray = os.path.join(STAGE, 'icons', 'make_icons.py')
    if os.path.exists(stray):
        os.remove(stray)

    files = []
    total = 0
    for dirpath, _dirs, names in os.walk(STAGE):
        for n in names:
            p = os.path.join(dirpath, n)
            files.append(p)
            total += os.path.getsize(p)

    print('staged %d files, %.2f MB -> %s' % (len(files), total / 1048576.0, STAGE))


if __name__ == '__main__':
    main()