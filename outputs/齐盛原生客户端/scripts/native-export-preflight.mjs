import {exportIdentity} from './native-export-profile.mjs';
import {verifyPhysicsArtifact} from './physics-build-receipt.mjs';
import {verifyColyseusArtifact} from './verify-colyseus-artifact.mjs';
import {prepareRuntimeLicenses} from './prepare-runtime-licenses.mjs';
const platform=process.argv[2];if(!['windows','android'].includes(platform)||process.argv.slice(3).some(value=>value!=='--prepare-licenses'))throw Error('Use windows|android [--prepare-licenses]');
const identity=await exportIdentity(),physics=await verifyPhysicsArtifact(platform),sdk=await verifyColyseusArtifact(platform);if(process.argv.includes('--prepare-licenses'))await prepareRuntimeLicenses();
console.log(JSON.stringify({version:'0.1.0',platform,...identity,physics,sdk}));
