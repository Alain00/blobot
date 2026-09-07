// Verify CI output before preparing a draft release. Never edits app pins or publishes.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { assets: { type: 'string' }, repository: { type: 'string' }, tag: { type: 'string' } } });
if (!values.assets || !/^[\w.-]+\/[\w.-]+$/.test(values.repository ?? '') || !/^machines-[\w.-]+$/.test(values.tag ?? '')) {
  throw new Error('Supply --assets, --repository owner/repo and a new --tag machines-*');
}
const assets = resolve(values.assets);
const inputs = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8'));
const catalog = {}, sums = [];
for (const [runtime, input] of Object.entries(inputs.runtimes)) {
  catalog[runtime] = [];
  for (const arch of ['arm64', 'amd64']) {
    const receipt = JSON.parse(await readFile(join(assets, `${runtime}-${arch}.json`), 'utf8'));
    const smoke = JSON.parse(await readFile(join(assets, `${runtime}-${arch}-smoke.json`), 'utf8'));
    if (!/^sha256:[a-f0-9]{64}$/.test(receipt.imageId) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0 || receipt.bytes > input.maxArchiveBytes ||
        receipt.runtime !== runtime || receipt.arch !== arch || receipt.version !== input.version ||
        receipt.base !== inputs.base || !/^[a-f0-9]{64}$/.test(receipt.recipe) ||
        receipt.reference !== `blobot-machine-${runtime}:${receipt.imageId.slice(7)}-${arch}` ||
        receipt.asset !== `blobot-machine-${runtime}-${arch}-${receipt.imageId.slice(7)}.tar` ||
        !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
        smoke.results?.length !== 1 || smoke.results[0].accepted !== true || smoke.results[0].receipt.imageId !== receipt.imageId) {
      throw new Error(`Incomplete or inconsistent acceptance for ${runtime}/${arch}`);
    }
    const path = join(assets, receipt.asset), hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== receipt.sha256 || (await stat(path)).size !== receipt.bytes) throw new Error(`Corrupt asset ${receipt.asset}`);
    catalog[runtime].push({ arch, reference: receipt.reference, imageId: receipt.imageId,
      url: `https://github.com/${values.repository}/releases/download/${values.tag}/${receipt.asset}`,
      sha256: receipt.sha256, bytes: receipt.bytes });
    sums.push(`${receipt.sha256}  ${receipt.asset}`);
  }
}
await writeFile(join(assets, 'runtime-builds.json'), JSON.stringify(catalog, null, 2) + '\n');
await writeFile(join(assets, 'SHA256SUMS'), sums.join('\n') + '\n');
