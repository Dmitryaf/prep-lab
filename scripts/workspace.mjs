import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Identify this checkout without exposing its absolute filesystem path.
export const workspaceId=createHash('sha256').update(resolve(dirname(fileURLToPath(import.meta.url)),'..').toLowerCase()).digest('hex');
