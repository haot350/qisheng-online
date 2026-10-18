import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(3),rustc=process.argv[2];
// Cross compilation still builds procedural macros for the Windows GNU host.
if(args.includes('aarch64-linux-android'))args.push('-C','linker='+path.join(project,'work/rust-toolchain/android-ndk-r28c/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),'-C','link-arg=--target=aarch64-linux-android29','-C','link-arg=--sysroot='+path.join(project,'work/rust-toolchain/android-ndk-r28c/toolchains/llvm/prebuilt/windows-x86_64/sysroot'),'-L','native='+path.join(project,'work/rust-toolchain/android-ndk-r28c/toolchains/llvm/prebuilt/windows-x86_64/lib/clang/19/lib/linux/aarch64'),'-C','link-arg=-Wl,-z,max-page-size=16384');
else args.push('-C','link-self-contained=yes','-L','native='+path.join(project,'work/rust-toolchain/installed/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained'));
const child=spawn(rustc,args,{stdio:'inherit',windowsHide:true});child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
