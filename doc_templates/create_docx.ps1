$src = "doc_templates\custom-reference"
$dst = "custom-reference.docx"
if (Test-Path $dst) { Remove-Item $dst }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst)
Write-Host "Created $dst"
