import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
const {prepareCampusMapCache}=await import('./build-map-cache-index.mjs');
console.log('Campus map cache index:',await prepareCampusMapCache());

// Remove generated output so legacy /route/index.html files cannot shadow
// the current extensionless /route.html export on static hosts.
if (command === 'build') {
  const site = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const generated=path.join(site,'dist');
  if(existsSync(generated)&&lstatSync(generated).isSymbolicLink())throw Error('Unsafe build output root.');
  for(const name of ['client','server']){
    const output=path.resolve(generated,name);
    if(output!==path.join(site,'dist',name)||(existsSync(output)&&lstatSync(output).isSymbolicLink()))throw Error('Unsafe build output path.');
    rmSync(output,{recursive:true,force:true});
  }
}

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
// Vinext's successful build force-exit can race pending libuv handle closures
// on Windows. Allow a successful build to drain naturally; errors still fail.
if (process.platform === 'win32' && command === 'build') {
  const exit = process.exit.bind(process);
  process.exit = code => {
    if (code === 0) { process.exitCode = 0; return; }
    return exit(code);
  };
}
// The CLI schedules its async build during import; module evaluation is not
// the build completion signal. Drain all build work before pruning output.
if(command==='build'&&!managedLinux){
 process.once('beforeExit',async()=>{
  if(process.exitCode&&process.exitCode!==0)return;
  try{
   const {cleanUnusedClientChunks}=await import('./clean-build-chunks.mjs');
   const site=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
   console.log('Generated JavaScript cleanup:',await cleanUnusedClientChunks(site));
  }catch(error){console.error(error);process.exitCode=1;}
 });
}
await import(cli.href);
