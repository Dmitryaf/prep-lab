Option Explicit
Dim shell, files, root, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
command = "node.exe --experimental-strip-types """ & root & "\scripts\launch.ts"""
On Error Resume Next
shell.Run command, 0, False
If Err.Number <> 0 Then
  MsgBox "Could not start Frontend Lab. Install Node.js 22.17 or newer and try again.", 16, "Frontend Lab"
End If
