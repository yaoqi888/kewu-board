/*!
 * 科务看板 Word 报送稿生成器（无第三方依赖）
 * 生成真正的 .docx（OOXML / ZIP Store），可直接用 Word / WPS 打开。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DocxExport = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  function run(text, options) {
    const opts = options || {};
    const props = [];
    props.push('<w:rFonts w:ascii="Times New Roman" w:eastAsia="' + (opts.font || "仿宋") + '" w:hAnsi="Times New Roman"/>');
    if (opts.bold) props.push("<w:b/>");
    if (opts.color) props.push('<w:color w:val="' + opts.color + '"/>');
    if (opts.size) props.push('<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>');
    return "<w:r><w:rPr>" + props.join("") + '</w:rPr><w:t xml:space="preserve">' + escapeXml(text) + "</w:t></w:r>";
  }

  function paragraph(runs, options) {
    const opts = options || {};
    const props = [];
    props.push('<w:spacing w:before="' + (opts.before || 0) + '" w:after="' + (opts.after || 0) + '" w:line="' + (opts.line || 560) + '" w:lineRule="exact"/>');
    if (opts.align) props.push('<w:jc w:val="' + opts.align + '"/>');
    if (opts.indent) props.push('<w:ind w:firstLine="' + opts.indent + '"/>');
    if (opts.left) props.push('<w:ind w:left="' + opts.left + '"/>');
    return "<w:p><w:pPr>" + props.join("") + "</w:pPr>" + runs.join("") + "</w:p>";
  }

  function buildDocumentXml(report) {
    const body = [];
    body.push(paragraph([run(report.title, { bold: true, size: 44, font: "黑体" })], { align: "center", after: 180, line: 640 }));
    if (report.subtitle) {
      body.push(paragraph([run(report.subtitle, { size: 24, color: "666666", font: "楷体" })], { align: "center", after: 260, line: 500 }));
    }
    if (report.summary) {
      body.push(paragraph([run(report.summary, { size: 28 })], { indent: 560, after: 140 }));
    }
    (report.sections || []).forEach(function (section) {
      body.push(paragraph([run(section.heading, { bold: true, size: 32, font: "黑体" })], { before: 160, after: 100, line: 560 }));
      (section.items || []).forEach(function (item, index) {
        const titleRuns = [run((index + 1) + ". " + item.title, { bold: true, size: 28 })];
        if (item.meta) titleRuns.push(run("  " + item.meta, { size: 22, color: "555555" }));
        body.push(paragraph(titleRuns, { indent: 560, after: 40 }));
        if (item.result) {
          body.push(paragraph([run("办理结果：" + item.result, { size: 24, color: "444444" })], { left: 560, after: 110 }));
        }
      });
    });
    if (!(report.sections || []).length) {
      body.push(paragraph([run("本周期暂无已办结工作。", { size: 28 })], { indent: 560, after: 140 }));
    }
    if (report.footer) {
      body.push(paragraph([run(report.footer, { size: 20, color: "888888" })], { align: "right", before: 260, line: 420 }));
    }
    return XML_HEADER + '<w:document ' + W_NS + '><w:body>' + body.join("") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>' +
      "</w:body></w:document>";
  }

  function buildStylesXml() {
    return XML_HEADER + '<w:styles ' + W_NS + '>' +
      "<w:docDefaults><w:rPrDefault><w:rPr>" +
      '<w:rFonts w:ascii="Times New Roman" w:eastAsia="仿宋" w:hAnsi="Times New Roman"/>' +
      '<w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>' +
      "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>" +
      '<w:spacing w:line="560" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      "</w:styles>";
  }

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let j = 0; j < 8; j += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date) {
    const d = date instanceof Date ? date : new Date();
    const year = Math.max(1980, d.getFullYear());
    return {
      time: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1F),
      date: (((year - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F)
    };
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const stamp = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
      const checksum = crc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034B50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, checksum, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      localParts.push(local, dataBytes);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014B50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length + dataBytes.length;
    });
    const centralOffset = offset;
    const centralDirectory = concat(centralParts);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralDirectory.length, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);
    return concat(localParts.concat([centralDirectory, end]));
  }

  function concat(parts) {
    const total = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    parts.forEach(function (part) { output.set(part, offset); offset += part.length; });
    return output;
  }

  function buildReport(options) {
    const report = options || {};
    const contentTypes = XML_HEADER + `
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`.trim();

    const rootRels = XML_HEADER + `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`.trim();

    const documentRels = XML_HEADER + `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`.trim();

    const now = new Date().toISOString();
    const core = XML_HEADER + `
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(report.title || "工作报送")}</dc:title>
  <dc:creator>科务看板</dc:creator>
  <cp:lastModifiedBy>科务看板</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`.trim();

    return makeZip([
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: rootRels },
      { name: "docProps/core.xml", content: core },
      { name: "word/document.xml", content: buildDocumentXml(report) },
      { name: "word/_rels/document.xml.rels", content: documentRels },
      { name: "word/styles.xml", content: buildStylesXml() }
    ]);
  }

  return { buildReport: buildReport, escapeXml: escapeXml };
});
