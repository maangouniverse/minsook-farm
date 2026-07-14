Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredentialManager {
    [DllImport("Advapi32.dll", SetLastError = true, EntryPoint = "CredReadW", CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, int reserved, out IntPtr credentialPtr);

    [DllImport("Advapi32.dll", SetLastError = true, EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static byte[] GetPasswordBytes(string target) {
        IntPtr credPtr;
        if (CredRead(target, 1, 0, out credPtr)) {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
            CredFree(credPtr);
            return bytes;
        }
        return null;
    }
}
"@

$bytes = [CredentialManager]::GetPasswordBytes("Supabase CLI:supabase")
if ($bytes) {
    # Print as hex string
    $hex = ($bytes | ForEach-Object { "{0:X2}" -f $_ }) -join ""
    Write-Host "Hex: $hex"
    
    # Print as UTF8
    $utf8 = [System.Text.Encoding]::UTF8.GetString($bytes)
    Write-Host "UTF8: $utf8"

    # Print as ASCII
    $ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
    Write-Host "ASCII: $ascii"
} else {
    Write-Host "Credential not found or failed to read."
}
