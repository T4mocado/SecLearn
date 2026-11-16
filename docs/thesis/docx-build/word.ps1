# Mở file .docx bằng Word, cập nhật mục lục / danh mục, lưu lại và xuất PDF.
# powershell -File word.ps1 <vào.docx> <ra.docx> <ra.pdf>   (đường dẫn tương đối được tính từ thư mục hiện tại)
param($in, $out, $pdf)
$cwd = (Get-Location).Path
$in = [IO.Path]::GetFullPath([IO.Path]::Combine($cwd, $in))
$out = [IO.Path]::GetFullPath([IO.Path]::Combine($cwd, $out))
$pdf = [IO.Path]::GetFullPath([IO.Path]::Combine($cwd, $pdf))
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try {
  $doc = $w.Documents.Open($in, $false, $false, $false)
  $doc.Fields.Update() | Out-Null
  foreach ($t in $doc.TablesOfContents) { $t.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.SaveAs2($out, 16)
  $doc.ExportAsFixedFormat($pdf, 17)
  "pages: " + $doc.ComputeStatistics(2)
  $doc.Close($false)
} finally { $w.Quit() }
