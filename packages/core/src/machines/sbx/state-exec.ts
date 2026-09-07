import { createStateArchiveVerifier } from './state-archive.js';
import { createSbxArchiveIndex, selectSbxArchiveMembers } from './state-archive-index.js';
import { createSbxStateAttributeBackend, createSbxStateAttributeCodec, SBX_STATE_ATTRIBUTE_HELPER } from './state-attributes.js';
import { createSbxStateBundleReader, sbxStateBundleHeader } from './state-bundle.js';
import { createSbxStateDescriptionCodec } from './state-description.js';
import { createSbxFilesystemStateBackend } from './state-filesystem.js';
import { prepareSbxStateMaintenance } from './state-maintenance.js';
import { receiveSbxStateArchive } from './state-restore.js';
import { readSbxStateTree } from './state-tree.js';
import { serveSbxState } from './state-worker.js';

/** Build from compiled functions, with no host module imports or private payload in the code. */
export function sbxStateExecSource(): string {
  const functions = {
    prepare: prepareSbxStateMaintenance, verify: createStateArchiveVerifier, index: createSbxArchiveIndex,
    select: selectSbxArchiveMembers, read: readSbxStateTree, receive: receiveSbxStateArchive,
    description: createSbxStateDescriptionCodec, header: sbxStateBundleHeader, bundle: createSbxStateBundleReader,
    attributeCodec: createSbxStateAttributeCodec, attributes: createSbxStateAttributeBackend,
    backend: createSbxFilesystemStateBackend, serve: serveSbxState,
  };
  return `
'use strict';
const fs=require('node:fs'),commands=require('node:child_process'),crypto=require('node:crypto');
const functions={${Object.entries(functions).map(([name, fn]) => `${name}:(${fn.toString()})`).join(',')}};
const options=JSON.parse(process.argv[1]);
const attributes=functions.attributes(commands,functions.attributeCodec(),${JSON.stringify(SBX_STATE_ATTRIBUTE_HELPER)});
const backend=functions.backend({fs,commands,crypto},functions,attributes,options);
functions.serve(process.stdin,process.stdout,backend,crypto).catch(()=>{process.exitCode=1;});
`;
}

/**
 * The lifecycle owner must admit the exact owned reference, image, mounts and engine first.
 * Starting an exec can wake the guest. Closing its pipe never substitutes for stopping the VM.
 */
export function prepareSbxStateExec(options: {
  readonly name: string;
  readonly guestNode: string;
  readonly token: string;
  readonly role: 'source' | 'target';
  readonly maximumTreeBytes: number;
}): readonly string[] {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(options.name) ||
      !options.guestNode.startsWith('/') || options.guestNode.includes('\0') ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(options.token) ||
      (options.role !== 'source' && options.role !== 'target') ||
      !Number.isSafeInteger(options.maximumTreeBytes) || options.maximumTreeBytes < 1024) {
    throw new Error('Machine state worker configuration is invalid.');
  }
  return ['exec', '-i', '-u', '0', options.name, '/usr/bin/unshare', '--mount', '--propagation', 'private',
    options.guestNode, '-e', sbxStateExecSource(), JSON.stringify({
      token: options.token, role: options.role, maximumTreeBytes: options.maximumTreeBytes,
    })];
}
