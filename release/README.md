# Local release artifacts

`zyflow-0.1.0-chrome.zip` is the production **engineering preview**. Unzip it and load the directory through Chrome's **Load unpacked** action.

Live zyBooks activity compatibility is unverified; this package detects candidates and stops for inspection rather than executing synthetic fixture adapters. See [setup and fixture demo](../README.md) and [compatibility gates](../docs/compatibility.md).

`zyflow-0.1.0-chrome.zip.sha256` records the package checksum. Regenerate both with:

```sh
npm run zip
npm run package:release
```

The executable synthetic demo is built separately with `npm run build:test` and loaded from `.output/chrome-mv3-fixture`. Its localhost access does not appear in the production package.
