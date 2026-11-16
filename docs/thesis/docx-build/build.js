// Dựng khoa-luan-seclearn.docx theo bìa và định dạng của khóa luận mẫu NEU (Phạm Thị Mai, 2025).
// node build.js <thư mục thesis md> <logo.png> <out.docx>
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const d = require("docx");
const {
  Document, Packer, Paragraph, TextRun, SymbolRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, TextDirection, VerticalAlign, HeightRule,
  Footer, PageNumber, NumberFormat, TabStopType, LevelFormat, PageBreak,
  TableAnchorType, RelativeHorizontalPosition, RelativeVerticalPosition, OverlapType,
  Math: OMath, MathRun, MathFraction, MathSum, MathRadical, MathSubScript, MathSuperScript,
  MathSubSuperScript, MathRoundBrackets, PageBorderDisplay, PageBorderOffsetFrom, LineRuleType,
} = d;

const [, , SRC, LOGO, OUT] = process.argv;
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8").replace(/\r\n/g, "\n");

// ---------- hằng số trang (A4, lề theo quy định FIT NEU / bản mẫu) ----------
const CM = 567;
const PAGE = { width: 11906, height: 16838 };
const MARGIN = { top: Math.round(2.5 * CM), bottom: Math.round(2.5 * CM), left: Math.round(3.5 * CM), right: 2 * CM };
const TEXT_W = PAGE.width - MARGIN.left - MARGIN.right; // 8787
const FONT = "Times New Roman";
const LINE = 312; // 1.3 dòng
const pt = (n) => n * 2; // half-points
const tw = (n) => Math.round(n * 20); // pt -> twips

// ---------- inline: **đậm**, *nghiêng*, `code`, $toán$ ----------
const GREEK = { kappa: "κ", alpha: "α", beta: "β", lambda: "λ", sigma: "σ", mu: "μ" };
function texInline(src, base) {
  // chuyển LaTeX đơn giản sang các run; trả về mảng {text, bold, italics, sub, sup}
  const out = [];
  let i = 0;
  const push = (text, o = {}) => out.push({ text, ...base, ...o });
  const readGroup = () => {
    if (src[i] === "{") {
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      const g = src.slice(i + 1, j);
      i = j + 1;
      return g;
    }
    return src[i++];
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      const cmd = m[1];
      i += m[0].length;
      if (cmd === "mathbf") push(readGroup(), { bold: true, italics: false });
      else if (cmd === "mathrm" || cmd === "text") push(readGroup(), { italics: false });
      else if (cmd === "bar") push(readGroup() + "̄");
      else if (cmd === "lVert" || cmd === "rVert") push("‖", { italics: false });
      else if (cmd === "cdot") push(" · ", { italics: false });
      else if (cmd === "le") push(" ≤ ", { italics: false });
      else if (cmd === "pm") push(" ± ", { italics: false });
      else if (cmd === "," || cmd === " ") push(" ", { italics: false });
      else if (GREEK[cmd]) push(GREEK[cmd]);
      else push(cmd, { italics: false });
    } else if (c === "_" || c === "^") {
      i++;
      const g = readGroup();
      for (const r of texInline(g, base)) out.push({ ...r, [c === "_" ? "sub" : "sup"]: true });
    } else if (c === "{") {
      out.push(...texInline(readGroup(), base));
    } else if (/[a-zA-Z]/.test(c)) {
      push(c, { italics: true });
      i++;
    } else {
      push(c, { italics: false });
      i++;
    }
  }
  return out;
}

function inline(text, base = {}) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$]+\$|\*[^*\s][^*]*\*)/g;
  let last = 0, m;
  const plain = (t) => t && runs.push(new TextRun({ text: t, ...base }));
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) runs.push(new TextRun({ text: tok.slice(2, -2), ...base, bold: true }));
    else if (tok.startsWith("`")) runs.push(new TextRun({ text: tok.slice(1, -1), ...base, font: "Courier New", size: pt(11.5) }));
    else if (tok.startsWith("$")) {
      for (const r of texInline(tok.slice(1, -1), base)) {
        runs.push(new TextRun({ text: r.text, bold: r.bold ?? base.bold, italics: r.italics ?? base.italics, subScript: r.sub, superScript: r.sup, size: base.size }));
      }
    } else runs.push(new TextRun({ text: tok.slice(1, -1), ...base, italics: true }));
    last = m.index + tok.length;
  }
  plain(text.slice(last));
  return runs;
}

// ---------- công thức hiển thị (dựng tay bằng OMML) ----------
const mr = (t) => new MathRun(t);
const frac = (n, dd) => new MathFraction({ numerator: n, denominator: dd });
const sub = (b, s) => new MathSubScript({ children: b, subScript: s });
const sup = (b, s) => new MathSuperScript({ children: b, superScript: s });
const FORMULAS = {
  "2.1": [mr("cos"), new MathRoundBrackets({ children: [mr("q, d")] }), mr("="), frac([mr("q·d")], [mr("‖q‖ ‖d‖")])],
  "2.2": [mr("Recall@k="), frac([mr("|{đoạn liên quan trong top-k}|")], [mr("R")])],
  "2.3": [mr("MRR@k="), frac([mr("1")], [mr("|Q|")]), new MathSum({ children: [frac([mr("1")], [sub([mr("rank")], [mr("q")])])], subScript: [mr("q∈Q")] })],
  "2.4": [mr("DCG@k="), new MathSum({ children: [frac([sub([mr("rel")], [mr("i")])], [sub([mr("log")], [mr("2")]), new MathRoundBrackets({ children: [mr("i+1")] })])], subScript: [mr("i=1")], superScript: [mr("k")] }), mr(",    nDCG@k="), frac([mr("DCG@k")], [mr("IDCG@k")])],
  "2.5": [mr("κ="), frac([sub([mr("p")], [mr("o")]), mr("−"), sub([mr("p")], [mr("e")])], [mr("1−"), sub([mr("p")], [mr("e")])])],
  "2.6": [mr("SE="), new MathRadical({ children: [frac([mr("1")], [mr("n")]), mr("·"), frac([mr("1")], [mr("n")]), new MathSum({ children: [sup([new MathRoundBrackets({ children: [sub([mr("s")], [mr("i")]), mr("−s̄")] })], [mr("2")])], subScript: [mr("i=1")], superScript: [mr("n")] })] })],
  "3.1": [sub([mr("n")], [mr("c")]), mr("=N·"), frac([new MathRadical({ children: [sub([mr("m")], [mr("c")])] })], [new MathSum({ children: [new MathRadical({ children: [sub([mr("m")], [mr("c'")])] })], subScript: [mr("c'")] })])],
  "3.2": [sup([mr("SE")], [mr("2")]), mr("="), new MathSum({ children: [new MathSubSuperScript({ children: [mr("w")], subScript: [mr("c")], superScript: [mr("2")] }), new MathSubSuperScript({ children: [mr("SE")], subScript: [mr("c")], superScript: [mr("2")] })], subScript: [mr("c")] })],
};
const FORMULA_NAMES = {
  "2.1": "Độ tương đồng cosine", "2.2": "Recall@k", "2.3": "MRR@k", "2.4": "DCG@k và nDCG@k",
  "2.5": "Hệ số kappa của Cohen", "2.6": "Sai số chuẩn của điểm trung bình",
  "3.1": "Hạn mức theo căn bậc hai số đoạn của cụm", "3.2": "Sai số chuẩn của trung bình đều theo cụm",
};

// ---------- khối dựng sẵn ----------
const body = (children, opts = {}) => new Paragraph({ style: "BodyText", children, ...opts });
const para = (text, opts = {}) => body(inline(text), opts);
let listInstance = 0;

function mdTable(rows) {
  const parse = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const head = parse(rows[0]);
  const data = rows.slice(2).map(parse);
  const n = head.length;
  // độ rộng cột theo độ dài nội dung (căn bậc hai để cột dài không lấn hết)
  const len = Array.from({ length: n }, (_, k) => Math.max(...[head, ...data].map((r) => (r[k] || "").length), 3));
  const wgt = len.map((x) => Math.sqrt(Math.min(x, 400)));
  const sum = wgt.reduce((a, b) => a + b, 0);
  let widths = wgt.map((w) => Math.max(900, Math.round((w / sum) * TEXT_W)));
  const s2 = widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => Math.round((w * TEXT_W) / s2));
  widths[n - 1] += TEXT_W - widths.reduce((a, b) => a + b, 0);
  const bd = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: bd, bottom: bd, left: bd, right: bd };
  const cell = (txt, k, isHead) =>
    new TableCell({
      width: { size: widths[k], type: WidthType.DXA },
      borders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 90, right: 90 },
      children: [new Paragraph({ style: "TableText", alignment: isHead ? AlignmentType.CENTER : AlignmentType.LEFT, children: inline(txt || "", isHead ? { bold: true } : {}) })],
    });
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((t, k) => cell(t, k, true)) }),
      ...data.map((r) => new TableRow({ cantSplit: true, children: head.map((_, k) => cell(r[k], k, false)) })),
    ],
  });
}

// kích thước PNG đọc từ header IHDR
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

function figure(capLine) {
  // "[HÌNH] Hình 3.1. Tên hình (nguồn: `x`, mục y)."  hoặc  "[HÌNH: hinh/x.png] Hình 4.1. Tên hình."
  const fm = /^\[HÌNH:\s*([^\]]+)\]\s*/.exec(capLine);
  if (fm) {
    const data = fs.readFileSync(path.join(SRC, fm[1].trim()));
    const { w, h } = pngSize(data);
    // ảnh chụp màn hình (rộng) chiếm gần hết bề ngang trang; biểu đồ 200 dpi giữ đúng cỡ vẽ, tối đa 560 px
    // sơ đồ chương 2, 3 (Mermaid, xuất tỉ lệ 3): không viền, thu cho vừa khung 560 × 820 px của trang
    const diagram = /^hinh\/[23]-\d\d-(?!.*label-studio)/.test(fm[1].trim());
    const shot = w > 1800 && !diagram;
    const width = diagram ? Math.round(Math.min(560, w / 3, (820 * w) / h)) : shot ? 560 : Math.min(560, Math.round((w * 96) / 200));
    const pic = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF", space: 1 };
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 80, line: 240 },
        ...(shot ? { border: { top: pic, bottom: pic, left: pic, right: pic }, indent: { left: 180, right: 180 } } : {}),
        children: [new ImageRun({ type: "png", data, transformation: { width, height: Math.round((width * h) / w) }, altText: { title: fm[1].trim(), description: capLine.slice(fm[0].length), name: fm[1].trim() } })],
      }),
      new Paragraph({ style: "CaptionHinh", children: inline(capLine.slice(fm[0].length).replace(/\.$/, "")) }),
    ];
  }
  let cap = capLine.replace(/^\[HÌNH\]\s*/, "");
  let note = "";
  const m = /\s*\(nguồn: ([^)]*)\)\.?\s*$/.exec(cap);
  if (m) { note = " Nguồn vẽ: " + m[1].replace(/`/g, ""); cap = cap.slice(0, m.index).replace(/\.?$/, ""); }
  cap = cap.replace(/\.$/, "");
  const box = { style: BorderStyle.DASHED, size: 6, color: "808080", space: 8 };
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true,
      spacing: { before: 240, after: 120, line: 240 },
      border: { top: box, bottom: box, left: box, right: box },
      indent: { left: 1134, right: 1134 },
      children: [new TextRun({ text: "[Chèn hình tại đây]" + note, italics: true, color: "808080", size: pt(12), font: FONT }), new TextRun({ break: 4 })],
    }),
    new Paragraph({ style: "CaptionHinh", children: inline(cap) }),
  ];
}

// Công thức: bảng hai cột không viền. Ô trái chỉ chứa OMML để Word hiện ở dạng hiển thị (cỡ đầy đủ),
// ô phải chứa số hiệu (x.y) và trường TC cho danh mục công thức.
function formula(line) {
  const tag = /\\tag\{([^}]+)\}/.exec(line)[1];
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const nb = { top: none, bottom: none, left: none, right: none };
  const NUM_W = 1134;
  const cell = (w, children) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: nb, verticalAlign: VerticalAlign.CENTER, children });
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: [TEXT_W - NUM_W, NUM_W],
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [
      cell(TEXT_W - NUM_W, [new Paragraph({ style: "Formula", alignment: AlignmentType.CENTER, children: [new OMath({ children: FORMULAS[tag] })] })]),
      cell(NUM_W, [new Paragraph({ style: "Formula", alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: `@@TC:Công thức (${tag}) ${FORMULA_NAMES[tag] || ""}@@` }),
        new TextRun({ text: `(${tag})` }),
      ] })]),
    ] })],
  });
}

// Markdown → các khối docx. Mỗi dòng không trống là một đoạn (các file md viết một đoạn một dòng).
function convert(md) {
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let bulletOpen = false, numberOpen = false;
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trim();
    if (!/^- /.test(t)) bulletOpen = false;
    if (!/^\d+\. /.test(t)) numberOpen = false;
    if (!t || t === "---") { i++; continue; }
    let m;
    if ((m = /^(#{1,4}) (.*)$/.exec(t))) {
      const lvl = m[1].length;
      out.push(new Paragraph({ heading: ["Heading1", "Heading2", "Heading3", "Heading4"][lvl - 1], children: inline(m[2]) }));
    } else if (t.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      out.push(mdTable(rows));
      out.push(new Paragraph({ style: "AfterTable", children: [] }));
      continue;
    } else if (/^Bảng \d+\.\d+\. /.test(t) && (lines[i + 1] || "").trim() === "" && (lines[i + 2] || "").trim().startsWith("|")) {
      out.push(new Paragraph({ style: "CaptionBang", children: inline(t.replace(/\.$/, "")) }));
    } else if (/^Bảng \d+\.\d+\. /.test(t) && (lines[i + 1] || "").trim().startsWith("|")) {
      out.push(new Paragraph({ style: "CaptionBang", children: inline(t.replace(/\.$/, "")) }));
    } else if (t.startsWith("[HÌNH")) {
      out.push(...figure(t));
    } else if (t.startsWith("$$")) {
      out.push(formula(t));
    } else if ((m = /^- (.*)$/.exec(t))) {
      out.push(new Paragraph({ style: "ListPara", numbering: { reference: "dash", level: 0 }, children: inline(m[1]) }));
      bulletOpen = true;
    } else if ((m = /^(\d+)\. (.*)$/.exec(t))) {
      if (!numberOpen) listInstance++;
      numberOpen = true;
      out.push(new Paragraph({ style: "ListPara", numbering: { reference: "num", level: 0, instance: listInstance }, children: inline(m[2]) }));
    } else if (t.startsWith("[Chưa viết")) {
      out.push(new Paragraph({ style: "BodyText", children: [new TextRun({ text: t, italics: true, color: "808080" })] }));
    } else {
      out.push(para(t));
    }
    i++;
  }
  return out;
}

// tách phan-dau.md thành các phần theo "# "
function sections(md) {
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  const res = {};
  let cur = null;
  for (const l of md.split("\n")) {
    const m = /^# (.*)$/.exec(l);
    if (m) { cur = m[1].trim(); res[cur] = []; }
    else if (cur) res[cur].push(l);
  }
  for (const k in res) res[k] = res[k].join("\n").replace(/\n---\s*$/m, "").trim();
  return res;
}

// ---------- dữ liệu ----------
const front = sections(read("phan-dau.md"));
const TITLE = "Xây dựng trợ lý ảo hỏi đáp an toàn ứng dụng web dựa trên RAG và bộ dữ liệu đánh giá tiếng Việt";
const logo = fs.readFileSync(LOGO);

// ---------- BÌA ----------
const C = AlignmentType.CENTER;
const cp = (children, before = 0, extra = {}) => new Paragraph({ alignment: C, spacing: { before: tw(before), after: 0, line: 240 }, children, ...extra });
const cr = (text, size, o = {}) => new TextRun({ text, size: pt(size), bold: true, font: FONT, ...o });
const divider = (size) => [
  new TextRun({ text: "--------", size: pt(size), font: FONT }),
  ...["F09A", "F09A", "F026", "F09B", "F09B"].map((c) => new SymbolRun({ char: c, symbolfont: "Wingdings", size: pt(size) })),
  new TextRun({ text: "--------", size: pt(size), font: FONT }),
];
const infoLine = (label, value, before = 0) =>
  new Paragraph({
    spacing: { before: tw(before), after: 0, line: 240 + 48 },
    indent: { left: tw(72) },
    tabStops: [{ type: TabStopType.LEFT, position: tw(216) }],
    children: [cr(label, 14), cr("\t: " + value, 14)],
  });

// gáy bìa: bảng nổi một cột, chữ xoay dọc, đặt ngoài khung viền bên trái
const spineCell = (text, h) =>
  new TableRow({
    height: { value: tw(h), rule: HeightRule.EXACT },
    children: [new TableCell({
      width: { size: tw(20), type: WidthType.DXA },
      textDirection: TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      children: [new Paragraph({ alignment: C, spacing: { before: 0, after: 0, line: 240 }, children: [cr(text, 13)] })],
    })],
  });
const spine = new Table({
  width: { size: tw(20), type: WidthType.DXA },
  columnWidths: [tw(20)],
  float: {
    horizontalAnchor: TableAnchorType.PAGE, verticalAnchor: TableAnchorType.PAGE,
    absoluteHorizontalPosition: tw(25), absoluteVerticalPosition: tw(85),
    overlap: OverlapType.OVERLAP,
  },
  rows: [spineCell("[2026.x]", 70), spineCell("CÔNG NGHỆ THÔNG TIN", 230), spineCell("[HỌ VÀ TÊN]", 200), spineCell("[MÃ SV]", 130)],
});

const logoRun = (px) => new ImageRun({ type: "png", data: logo, transformation: { width: px, height: Math.round((px * 260) / 262) }, altText: { title: "Logo NEU", description: "Logo Đại học Kinh tế Quốc dân", name: "logo" } });

const cover = [
  spine,
  cp([cr("ĐẠI HỌC KINH TẾ QUỐC DÂN", 13)], 0),
  cp([cr("TRƯỜNG CÔNG NGHỆ", 14)], 10),
  cp(divider(13), 8),
  cp([logoRun(150)], 48),
  cp([cr("KHÓA LUẬN TỐT NGHIỆP", 24)], 36),
  new Paragraph({ alignment: C, spacing: { before: tw(42), after: 0, line: 312 }, indent: { left: 200, right: 200 }, children: [cr(TITLE.toUpperCase(), 20)] }),
  infoLine("Tên sinh viên", "[Họ và tên]", 80),
  infoLine("Giảng viên hướng dẫn", "[Học hàm, học vị, họ tên GVHD]"),
  cp([cr("Hà Nội, [tháng]/[năm]", 13.5)], 96),
  new Paragraph({ children: [new PageBreak()] }),
  // ----- bìa phụ -----
  cp([cr("ĐẠI HỌC KINH TẾ QUỐC DÂN", 14)], 0),
  cp([cr("TRƯỜNG CÔNG NGHỆ", 14)], 10),
  cp(divider(14), 8),
  cp([logoRun(128)], 6),
  cp([cr("KHÓA LUẬN TỐT NGHIỆP", 24)], 26),
  new Paragraph({ alignment: C, spacing: { before: tw(24), after: 0, line: 312 }, indent: { left: 200, right: 200 }, children: [cr(TITLE, 20)] }),
  infoLine("Tên sinh viên", "[Họ và tên]", 40),
  infoLine("Mã sinh viên", "[Mã SV]"),
  infoLine("Lớp", "[Lớp]"),
  infoLine("Ngành", "Công nghệ thông tin"),
  infoLine("Khoa", "Công nghệ thông tin"),
  infoLine("Giảng viên hướng dẫn", "[Học hàm, học vị, họ tên GVHD]"),
  cp([new TextRun({ text: "--------------------------------", size: pt(14), font: FONT })], 40),
  cp([new TextRun({ text: "(Chữ ký GVHD)", size: pt(14), italics: true, font: FONT })], 4),
  cp([cr("Hà Nội, [tháng]/[năm]", 13.5)], 56),
];

// ---------- phần đầu ----------
const H1 = (t) => new Paragraph({ heading: "Heading1", children: [new TextRun(t)] });
const fieldPlaceholder = (key) => new Paragraph({ children: [new TextRun({ text: `@@FIELD:${key}@@` })] });

const camDoan = front["LỜI CAM ĐOAN"].split("\n").map((s) => s.trim()).filter(Boolean);
const sigIdx = camDoan.findIndex((s) => s.startsWith("Hà Nội"));
const sig = (text, o = {}) => new Paragraph({ alignment: C, indent: { left: tw(230) }, spacing: { before: 0, after: 0, line: LINE }, children: [new TextRun({ text, size: pt(14), font: FONT, ...o })] });

const frontMatter = [
  H1("MỤC LỤC"), fieldPlaceholder("TOC"),
  H1("LỜI CAM ĐOAN"),
  ...camDoan.slice(0, sigIdx).map((s) => para(s)),
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: tw(12), after: 0, line: LINE }, children: [new TextRun({ text: camDoan[sigIdx], size: pt(14), italics: true, font: FONT })] }),
  sig(camDoan[sigIdx + 1], { bold: true }),
  sig(camDoan[sigIdx + 2], { italics: true }),
  new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
  new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
  sig(camDoan[sigIdx + 3]),
  H1("LỜI CẢM ƠN"),
  ...convert(front["LỜI CẢM ƠN"]),
  H1("DANH MỤC CÁC TỪ VIẾT TẮT"),
  ...convert(front["DANH MỤC CÁC TỪ VIẾT TẮT"]),
  H1("DANH MỤC BẢNG"), fieldPlaceholder("TOB"),
  H1("DANH MỤC HÌNH"), fieldPlaceholder("TOF"),
  H1("DANH MỤC CÔNG THỨC"), fieldPlaceholder("TOE"),
];

// ---------- thân bài ----------
const todo = (t) => new Paragraph({ style: "BodyText", children: [new TextRun({ text: t, italics: true, color: "808080" })] });
const skeletonCh4 = [];
{
  const toc = sections(read("phan-dau.md"))["MỤC LỤC"].split("\n");
  let on = false;
  for (const raw of toc) {
    const t = raw.trim();
    if (t.startsWith("CHƯƠNG 4")) on = true;
    else if (/^(KẾT LUẬN|TÀI LIỆU)/.test(t)) on = false;
    if (!on || !t) continue;
    const lvl = t.startsWith("CHƯƠNG") ? 1 : /^\d+\.\d+\.\d+\./.test(t) ? 3 : 2;
    skeletonCh4.push(new Paragraph({ heading: `Heading${lvl}`, children: [new TextRun(t)] }));
    if (lvl === 3 || t === "4.5. Tiến độ thực hiện") skeletonCh4.push(todo("[Chưa viết]"));
  }
}
const refs = read("tai-lieu-tham-khao.md").replace(/<!--[\s\S]*?-->/g, "").split("\n").map((s) => s.trim()).filter((s) => /^\[\d+\]/.test(s));

const main = [
  H1("MỞ ĐẦU"),
  ...convert(front["MỞ ĐẦU"]),
  ...convert(read("chuong-1.md")),
  ...convert(read("chuong-2.md")),
  ...convert(read("chuong-3-phan-ung-dung.md")),
  ...convert(read("chuong-3-bo-danh-gia.md")),
  ...(fs.existsSync(path.join(SRC, "chuong-4.md")) ? convert(read("chuong-4.md")) : skeletonCh4),
  H1("KẾT LUẬN"), todo("[Chưa viết]"),
  H1("TÀI LIỆU THAM KHẢO"),
  ...refs.map((r) => new Paragraph({ style: "RefItem", children: inline(r) })),
  H1("PHỤ LỤC"), todo("[Chưa viết]"),
];

// ---------- styles ----------
const ps = (id, name, run, paragraph, extra = {}) => ({ id, name, basedOn: "Normal", next: "BodyText", quickFormat: true, run: { font: FONT, ...run }, paragraph, ...extra });
const styles = {
  default: {
    document: { run: { font: FONT, size: pt(13) }, paragraph: { spacing: { line: LINE } } },
    heading1: { run: { font: FONT, size: pt(18), bold: true, color: "000000" }, paragraph: { alignment: C, spacing: { before: 0, after: tw(18), line: LINE }, keepNext: true, pageBreakBefore: true, outlineLevel: 0 } },
    heading2: { run: { font: FONT, size: pt(13), bold: true, color: "000000" }, paragraph: { spacing: { before: tw(12), after: tw(6), line: LINE }, keepNext: true, outlineLevel: 1 } },
    heading3: { run: { font: FONT, size: pt(13), bold: true, italics: true, color: "000000" }, paragraph: { spacing: { before: tw(6), after: tw(6), line: LINE }, keepNext: true, outlineLevel: 2 } },
    heading4: { run: { font: FONT, size: pt(13), italics: true, color: "000000" }, paragraph: { spacing: { before: tw(6), after: tw(6), line: LINE }, keepNext: true, outlineLevel: 3 } },
  },
  paragraphStyles: [
    ps("BodyText", "Body Text", { size: pt(13) }, { alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 720 }, spacing: { before: 0, after: tw(6), line: LINE } }),
    ps("ListPara", "List Paragraph", { size: pt(13) }, { alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: tw(3), line: LINE } }),
    ps("TableText", "Table Text", { size: pt(12) }, { spacing: { before: 0, after: 0, line: 264 } }),
    ps("AfterTable", "After Table", { size: pt(6) }, { spacing: { before: 0, after: tw(6), line: 240 } }),
    ps("CaptionBang", "Caption Bang", { size: pt(13), italics: true }, { alignment: C, keepNext: true, spacing: { before: tw(6), after: tw(6), line: LINE } }),
    ps("CaptionHinh", "Caption Hinh", { size: pt(13), italics: true }, { alignment: C, spacing: { before: tw(3), after: tw(12), line: LINE } }),
    ps("Formula", "Formula", { size: pt(13) }, { spacing: { before: tw(6), after: tw(6), line: 240 } }),
    ps("RefItem", "Reference Item", { size: pt(13) }, { alignment: AlignmentType.JUSTIFIED, indent: { left: 567, hanging: 567 }, spacing: { before: 0, after: tw(6), line: LINE } }),
    ps("TOC1", "toc 1", { size: pt(13), bold: true, italics: true }, { spacing: { before: tw(6), after: 0, line: LINE }, tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W, leader: "dot" }] }),
    ps("TOC2", "toc 2", { size: pt(13), bold: true }, { indent: { left: 260 }, spacing: { before: tw(3), after: 0, line: LINE }, tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W, leader: "dot" }] }),
    ps("TOC3", "toc 3", { size: pt(13) }, { indent: { left: 520 }, spacing: { before: 0, after: 0, line: LINE }, tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W, leader: "dot" }] }),
    ps("TOC9", "toc 9", { size: pt(13) }, { spacing: { before: 0, after: tw(3), line: LINE }, tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W, leader: "dot" }] }),
    ps("FooterNum", "Footer Num", { size: pt(12) }, { alignment: C, spacing: { before: 0, after: 0, line: 240 } }),
  ],
};

const numbering = {
  config: [
    { reference: "dash", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1004, hanging: 284 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1077, hanging: 357 } } } }] },
  ],
};

const footer = () => ({ default: new Footer({ children: [new Paragraph({ style: "FooterNum", children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) });
const pageProps = (extra = {}) => ({ page: { size: PAGE, margin: { ...MARGIN, header: 709, footer: 567 }, ...extra } });
const borderLine = { style: BorderStyle.THIN_THICK_MEDIUM_GAP, size: 24, color: "000080" };
const borderLineB = { style: BorderStyle.THICK_THIN_MEDIUM_GAP, size: 24, color: "000080" };

const doc = new Document({
  creator: "[Họ và tên]",
  title: TITLE,
  features: { updateFields: true },
  styles,
  numbering,
  sections: [
    {
      properties: {
        ...pageProps({
          borders: {
            pageBorderTop: { ...borderLine, space: 14 }, pageBorderLeft: { ...borderLine, space: 18 },
            pageBorderBottom: { ...borderLineB, space: 14 }, pageBorderRight: { ...borderLineB, space: 18 },
            pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.TEXT },
          },
        }),
      },
      children: cover,
    },
    { properties: { ...pageProps({ pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } }) }, footers: footer(), children: frontMatter },
    { properties: { ...pageProps({ pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }) }, footers: footer(), children: main },
  ],
});

// ---------- hậu xử lý XML: trường TOC/TC ----------
const FIELDS = {
  TOC: 'TOC \\o "1-3" \\h \\z \\u',
  TOB: 'TOC \\h \\z \\t "Caption Bang,9"',
  TOF: 'TOC \\h \\z \\t "Caption Hinh,9"',
  TOE: "TOC \\h \\z \\f c",
};
const fld = (instr, result) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve">${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

(async () => {
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  xml = xml.replace(/<w:r>(?:(?!<w:r>).)*?<w:t[^>]*>@@FIELD:(\w+)@@<\/w:t><\/w:r>/g, (_, k) => fld(FIELDS[k], "Chuột phải → Update Field (hoặc Ctrl+A, F9) để cập nhật."));
  xml = xml.replace(/<w:r>(?:(?!<w:r>).)*?<w:t[^>]*>@@TC:(.*?)@@<\/w:t><\/w:r>/g, (_, t) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TC "${esc(t).replace(/&quot;/g, "'")}" \\f c \\l 9 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`);
  if (/@@/.test(xml)) { const k = xml.indexOf("@@"); console.error(xml.slice(k - 400, k + 80)); throw new Error("placeholder"); }
  zip.file("word/document.xml", xml);
  const outBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(OUT, outBuf);
  console.log("wrote", OUT, outBuf.length);
})();
