import {verifyPhysicsArtifact} from './physics-build-receipt.mjs';
console.log(JSON.stringify(await verifyPhysicsArtifact(process.argv[2]||'windows')));
