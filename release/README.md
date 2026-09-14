# Local release artifacts

`zyflow-0.1.1-chrome.zip` is the production **engineering preview**. Unzip it and load the directory through Chrome's **Load unpacked** action.

This package adds live adapters for the inspected animation and single-choice widgets, recognizes completed work, and excludes nested participation badges from the activity count. Other widget families remain unsupported. See [setup and fixture demo](../README.md) and [compatibility gates](../docs/compatibility.md).

`zyflow-0.1.1-chrome.zip.sha256` records the package checksum. Regenerate both with:

```sh
npm run zip
npm run package:release
```

The executable synthetic demo is built separately with `npm run build:test` and loaded from `.output/chrome-mv3-fixture`. Its localhost access does not appear in the production package.
