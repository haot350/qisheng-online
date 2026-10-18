param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string[]]$Arguments = @('--', '--smoke'),
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [int]$TimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $env:OS -ne 'Windows_NT') { throw 'Windows only.' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
# This debugger owns one newly created process only. It does not change WER,
# registry, system debugger settings or other applications. Dumps are PRIVATE:
# even a small dump may include tokens from stack memory. Never upload them.
$source = @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class QsCrashCapture {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public uint cb; public string reserved,desktop,title; public uint x,y,cx,cy,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr reserved2p,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr process,thread;public uint processId,threadId;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WaitForDebugEvent(IntPtr ev,uint timeout);
 [DllImport("kernel32.dll")] static extern bool ContinueDebugEvent(uint process,uint thread,uint status);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandleW(IntPtr file,StringBuilder name,uint size,uint flags);
 [DllImport("dbghelp.dll",SetLastError=true)] static extern bool MiniDumpWriteDump(IntPtr process,uint processId,IntPtr file,uint flags,IntPtr exception,IntPtr stream,IntPtr callback);
 static string Quote(string value) { var text=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){text.Append('\\',slashes*2+1).Append(c);}else{text.Append('\\',slashes).Append(c);}slashes=0;}return text.Append('\\',slashes*2).Append('"').ToString(); }
 static string FileName(IntPtr handle) { var name=new StringBuilder(4096); return GetFinalPathNameByHandleW(handle,name,4096,0)>0 ? name.ToString() : "unknown"; }
 static ulong ImageSize(string file) {try{using(var reader=new BinaryReader(File.OpenRead(file))){reader.BaseStream.Position=60;uint pe=reader.ReadUInt32();reader.BaseStream.Position=pe+24+56;return reader.ReadUInt32();}}catch{return 0;}}
 static ulong U64(IntPtr p,int offset) {return unchecked((ulong)Marshal.ReadInt64(p,offset));}
 public static string Run(string executable,string[] args,string output,int timeout) {
  var report=new List<string>(); var modules=new SortedDictionary<ulong,Tuple<string,ulong>>();
  var command=new StringBuilder(Quote(executable)); foreach(var arg in args) command.Append(" ").Append(Quote(arg));
  var startup=new STARTUPINFO(); startup.cb=(uint)Marshal.SizeOf(startup); PROCESS_INFORMATION child;
  if(!CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,false,0x2,IntPtr.Zero,Path.GetDirectoryName(executable),ref startup,out child)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  var ev=Marshal.AllocHGlobal(512); var clock=Stopwatch.StartNew(); bool crashed=false,timedOut=false;uint exit=0;
  try {while(true) {
   if(clock.Elapsed.TotalSeconds>timeout) {timedOut=true;TerminateProcess(child.process,124);}
   if(!WaitForDebugEvent(ev,500)) continue;
   uint kind=(uint)Marshal.ReadInt32(ev,0),pid=(uint)Marshal.ReadInt32(ev,4),tid=(uint)Marshal.ReadInt32(ev,8),status=0x10002;
   if(kind==3) {var file=Marshal.ReadIntPtr(ev,16);var name=FileName(file);modules[U64(ev,40)]=Tuple.Create(Path.GetFileName(name),ImageSize(name));if(file!=IntPtr.Zero)CloseHandle(file);}
   if(kind==6) {var file=Marshal.ReadIntPtr(ev,16);var name=FileName(file);modules[U64(ev,24)]=Tuple.Create(Path.GetFileName(name),ImageSize(name));if(file!=IntPtr.Zero)CloseHandle(file);}
   if(kind==7) modules.Remove(U64(ev,16));
   if(kind==1) {
    uint code=(uint)Marshal.ReadInt32(ev,16),first=(uint)Marshal.ReadInt32(ev,168);ulong address=U64(ev,32);
    // Only the loader's initial breakpoint is consumed. Other first-chance
    // exceptions are delivered to the app, preserving its normal handlers.
    if(code!=0x80000003) status=0x80010001;
    if(first==0 && code!=0x80000003) {
     crashed=true;string module="unknown";ulong moduleBase=0;foreach(var row in modules)if(row.Key<=address&&address-row.Key<row.Value.Item2){module=row.Value.Item1;moduleBase=row.Key;}
     report.Add("exception=0x"+code.ToString("X8"));report.Add("module="+module);report.Add("moduleOffset=0x"+(address-moduleBase).ToString("X"));report.Add("thread="+tid);
     using(var dump=File.Create(Path.Combine(output,"PRIVATE-crash.dmp"))) {bool ok=MiniDumpWriteDump(child.process,child.processId,dump.SafeFileHandle.DangerousGetHandle(),0x1020,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);report.Add("dumpWritten="+ok);if(!ok)report.Add("dumpError="+Marshal.GetLastWin32Error());}
    }
   }
   if(kind==5) {exit=(uint)Marshal.ReadInt32(ev,16);ContinueDebugEvent(pid,tid,status);break;}
   ContinueDebugEvent(pid,tid,status);
  }} finally {Marshal.FreeHGlobal(ev);CloseHandle(child.thread);CloseHandle(child.process);}
  report.Add("exitCode="+exit);report.Add("durationMs="+clock.ElapsedMilliseconds);report.Add("crashed="+crashed);report.Add("timedOut="+timedOut);report.Add("scope=new-child-only");
  return String.Join(Environment.NewLine,report);
 }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
$previousAppData=$env:APPDATA; $previousLocalAppData=$env:LOCALAPPDATA
try {
  $env:APPDATA=Join-Path $OutputDirectory 'appdata'; $env:LOCALAPPDATA=Join-Path $OutputDirectory 'localappdata'
  New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null
  $result=[QsCrashCapture]::Run($Executable,$Arguments,$OutputDirectory,$TimeoutSeconds)
  [IO.File]::WriteAllText((Join-Path $OutputDirectory 'debugger-result.txt'),$result)
  $result
} finally { $env:APPDATA=$previousAppData; $env:LOCALAPPDATA=$previousLocalAppData }
