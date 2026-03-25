import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const conversionOptions = [
  { value: "pdf-to-word", label: "PDF to Word (.docx)" },
  { value: "word-to-pdf", label: "Word to PDF (.pdf)" },
  { value: "image-to-pdf", label: "Image to PDF (.pdf)" },
  { value: "pdf-to-text", label: "PDF to Text (.txt)" },
  { value: "word-to-text", label: "Word to Text (.txt)" },
  { value: "pdf-to-image", label: "PDF to Image (.png)" },
  { value: "image-to-word", label: "Image to Word (.docx)" }
];

function App() {
  const [mode, setMode] = useState("converter");
  const [selectedFile, setSelectedFile] = useState(null);
  const [conversionType, setConversionType] = useState("pdf-to-word");
  const [isDragging, setIsDragging] = useState(false);
  const [isEditorDragging, setIsEditorDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editorZoom, setEditorZoom] = useState(100);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadData, setDownloadData] = useState(null);
  const [editorTitle, setEditorTitle] = useState("Untitled Document");
  const [editorHtml, setEditorHtml] = useState("<p></p>");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [ignoreSpaces, setIgnoreSpaces] = useState(false);

  const fileInputRef = useRef(null);
  const editorImportInputRef = useRef(null);
  const editorRef = useRef(null);

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return "";
    }

    if (selectedFile.type.startsWith("image/")) {
      return URL.createObjectURL(selectedFile);
    }

    return "";
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      if (downloadData?.url) {
        URL.revokeObjectURL(downloadData.url);
      }
    };
  }, [previewUrl, downloadData]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== editorHtml) {
      editorRef.current.innerHTML = editorHtml;
    }

    if (findText.trim()) {
      applyFindHighlights(findText);
    }
  }, [editorHtml]);

  useEffect(() => {
    if (!findText.trim()) {
      return;
    }

    applyFindHighlights(findText);
  }, [matchCase, wholeWord, ignoreSpaces]);

  function resetResult() {
    if (downloadData?.url) {
      URL.revokeObjectURL(downloadData.url);
    }

    setDownloadData(null);
  }

  function onFilePicked(file) {
    setErrorMessage("");
    resetResult();

    if (!file) {
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File is too large. Please upload a file up to 10MB.");
      return;
    }

    setSelectedFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    onFilePicked(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  async function convertFile() {
    if (!selectedFile) {
      setErrorMessage("Please choose a file first.");
      return;
    }

    setErrorMessage("");
    setIsConverting(true);
    setUploadProgress(0);
    resetResult();

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("conversionType", conversionType);

      const response = await axios.post(`${API_URL}/api/convert`, formData, {
        responseType: "blob",
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) {
            return;
          }

          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      const suggestedName = getFileNameFromDisposition(response.headers["content-disposition"]);
      const blobUrl = URL.createObjectURL(response.data);

      setDownloadData({
        url: blobUrl,
        fileName: suggestedName || "converted-file"
      });
    } catch (error) {
      const defaultMessage = "Conversion failed. Please verify file type and try again.";
      const message = await getErrorMessage(error, defaultMessage);
      setErrorMessage(message);
    } finally {
      setIsConverting(false);
      setUploadProgress(0);
    }
  }

  async function exportEditor(format) {
    const plainText = htmlToPlainText(editorHtml);
    if (!plainText.trim()) {
      setErrorMessage("Please write something in the editor before exporting.");
      return;
    }

    setErrorMessage("");
    setIsExporting(true);
    resetResult();

    try {
      const response = await axios.post(
        `${API_URL}/api/editor/export`,
        {
          title: editorTitle,
          content: plainText,
          contentHtml: editorHtml,
          format
        },
        {
          responseType: "blob"
        }
      );

      const suggestedName = getFileNameFromDisposition(response.headers["content-disposition"]);
      const blobUrl = URL.createObjectURL(response.data);

      setDownloadData({
        url: blobUrl,
        fileName: suggestedName || `editor-export.${format}`
      });
    } catch (error) {
      const defaultMessage = "Export failed. Please try again.";
      const message = await getErrorMessage(error, defaultMessage);
      setErrorMessage(message);
    } finally {
      setIsExporting(false);
    }
  }

  async function importFileForEditing(file) {
    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isAllowed = fileName.endsWith(".pdf") || fileName.endsWith(".doc") || fileName.endsWith(".docx");

    if (!isAllowed) {
      setErrorMessage("Only PDF or Word files can be imported to the editor.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File is too large. Please upload a file up to 10MB.");
      return;
    }

    setErrorMessage("");
    setIsImporting(true);
    resetResult();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(`${API_URL}/api/editor/import`, formData);
      setEditorTitle(response.data?.title || "Untitled Document");
      setEditorHtml(response.data?.htmlContent || textToHtml(response.data?.content || ""));
      setMode("editor");
    } catch (error) {
      const message = await getApiErrorMessage(error, "Import failed. Please try another file.");
      setErrorMessage(message);
    } finally {
      setIsImporting(false);
      if (editorImportInputRef.current) {
        editorImportInputRef.current.value = "";
      }
    }
  }

  function handleEditorDrop(event) {
    event.preventDefault();
    setIsEditorDragging(false);
    const file = event.dataTransfer.files?.[0];
    importFileForEditing(file);
  }

  function handleEditorDragOver(event) {
    event.preventDefault();
    setIsEditorDragging(true);
  }

  function handleEditorDragLeave(event) {
    event.preventDefault();
    setIsEditorDragging(false);
  }

  function runEditorCommand(command, value = null) {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    document.execCommand(command, false, value);
    setEditorHtml(getCleanEditorHtml());
    if (findText.trim()) {
      applyFindHighlights(findText);
    }
  }

  function setZoom(nextZoom) {
    const clamped = Math.max(60, Math.min(180, nextZoom));
    setEditorZoom(clamped);
  }

  function createLink() {
    const url = window.prompt("Enter URL");
    if (!url) {
      return;
    }
    runEditorCommand("createLink", url);
  }

  function insertImageByUrl() {
    const url = window.prompt("Enter image URL");
    if (!url) {
      return;
    }
    runEditorCommand("insertImage", url);
  }

  function getCleanEditorHtml() {
    if (!editorRef.current) {
      return editorHtml;
    }

    const clone = editorRef.current.cloneNode(true);
    clone.querySelectorAll("mark.find-hit").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    });

    return clone.innerHTML;
  }

  function clearFindHighlights() {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.querySelectorAll("mark.find-hit").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    });

    editorRef.current.normalize();
  }

  function applyFindHighlights(query) {
    if (!editorRef.current) {
      return;
    }

    clearFindHighlights();

    const textQuery = query.trim();
    if (!textQuery) {
      setFindMatchCount(0);
      setActiveMatchIndex(-1);
      return;
    }

    const root = editorRef.current;
    const regex = buildSearchRegex(textQuery);
    if (!regex) {
      setFindMatchCount(0);
      setActiveMatchIndex(-1);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeValue && currentNode.nodeValue.trim().length > 0) {
        nodes.push(currentNode);
      }
      currentNode = walker.nextNode();
    }

    let matchIndex = 0;

    nodes.forEach((node) => {
      const original = node.nodeValue;
      if (!original) {
        return;
      }

      regex.lastIndex = 0;
      if (!regex.test(original)) {
        return;
      }

      regex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match = regex.exec(original);

      while (match) {
        const start = match.index;
        const end = start + match[0].length;

        if (start > lastIndex) {
          fragment.appendChild(document.createTextNode(original.slice(lastIndex, start)));
        }

        const mark = document.createElement("mark");
        mark.className = "find-hit";
        mark.textContent = original.slice(start, end);
        if (matchIndex === 0) {
          mark.classList.add("active");
        }

        fragment.appendChild(mark);
        matchIndex += 1;
        lastIndex = end;

        if (regex.lastIndex === match.index) {
          regex.lastIndex += 1;
        }

        match = regex.exec(original);
      }

      if (lastIndex < original.length) {
        fragment.appendChild(document.createTextNode(original.slice(lastIndex)));
      }

      node.parentNode?.replaceChild(fragment, node);
    });

    setFindMatchCount(matchIndex);
    setActiveMatchIndex(matchIndex > 0 ? 0 : -1);
  }

  function jumpToMatch(direction) {
    if (!editorRef.current) {
      return;
    }

    const hits = Array.from(editorRef.current.querySelectorAll("mark.find-hit"));
    if (hits.length === 0) {
      return;
    }

    const nextIndex = activeMatchIndex < 0
      ? 0
      : (activeMatchIndex + direction + hits.length) % hits.length;

    hits.forEach((hit) => hit.classList.remove("active"));
    hits[nextIndex].classList.add("active");
    hits[nextIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveMatchIndex(nextIndex);
  }

  function replaceCurrentMatch() {
    if (!editorRef.current) {
      return;
    }

    const hits = Array.from(editorRef.current.querySelectorAll("mark.find-hit"));
    if (hits.length === 0) {
      return;
    }

    const index = activeMatchIndex >= 0 ? activeMatchIndex : 0;
    const target = hits[index];
    target.replaceWith(document.createTextNode(replaceText));

    const cleanHtml = getCleanEditorHtml();
    setEditorHtml(cleanHtml);
    if (findText.trim()) {
      applyFindHighlights(findText);
    }
  }

  function replaceAllMatches() {
    if (!editorRef.current || !findText.trim()) {
      return;
    }

    clearFindHighlights();

    const root = editorRef.current;
    const regex = buildSearchRegex(findText.trim());
    if (!regex) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue) {
        node.nodeValue = node.nodeValue.replace(regex, replaceText);
      }
      node = walker.nextNode();
    }

    const cleanHtml = getCleanEditorHtml();
    setEditorHtml(cleanHtml);
    applyFindHighlights(findText);
  }

  function buildSearchRegex(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      return null;
    }

    const flags = matchCase ? "g" : "gi";

    if (ignoreSpaces) {
      const compactQuery = trimmed.replace(/\s+/g, "");
      if (!compactQuery) {
        return null;
      }

      const charPattern = compactQuery
        .split("")
        .map((char) => escapeRegExp(char))
        .join("\\s*");

      const wrapped = wholeWord ? `\\b${charPattern}\\b` : charPattern;
      return new RegExp(wrapped, flags);
    }

    const escaped = escapeRegExp(trimmed);
    const wrapped = wholeWord ? `\\b${escaped}\\b` : escaped;
    return new RegExp(wrapped, flags);
  }

  return (
    <div className="page-shell">
      <div className="aurora aurora-left" />
      <div className="aurora aurora-right" />

      <main className="card">
        <h1>Smart PDF Converter</h1>
        <p className="subtitle">Convert files or create polished PDF/Word documents from the built-in editor.</p>

        <section className="mode-switch" role="tablist" aria-label="Select tool mode">
          <button
            type="button"
            className={mode === "converter" ? "mode-button active" : "mode-button"}
            onClick={() => {
              setMode("converter");
              setErrorMessage("");
            }}
            disabled={isConverting || isExporting}
          >
            File Converter
          </button>
          <button
            type="button"
            className={mode === "editor" ? "mode-button active" : "mode-button"}
            onClick={() => {
              setMode("editor");
              setErrorMessage("");
            }}
            disabled={isConverting || isExporting}
          >
            Word/PDF Editor
          </button>
        </section>

        {mode === "converter" && (
          <>
            <section
              className={`drop-zone ${isDragging ? "dragging" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) => onFilePicked(event.target.files?.[0])}
              />

              <p className="drop-title">Drag and drop your file here</p>
              <p className="drop-text">or click to browse (.pdf, .doc, .docx, .jpg, .jpeg, .png)</p>
            </section>

            {selectedFile && (
              <section className="file-info">
                <p><strong>Selected:</strong> {selectedFile.name}</p>
                <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                {previewUrl && <img className="preview-image" src={previewUrl} alt="Preview" />}
              </section>
            )}

            <section className="controls">
              <label htmlFor="conversionType">Conversion Type</label>
              <select
                id="conversionType"
                value={conversionType}
                onChange={(event) => setConversionType(event.target.value)}
                disabled={isConverting}
              >
                {conversionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button type="button" onClick={convertFile} disabled={isConverting || !selectedFile}>
                {isConverting ? "Converting..." : "Convert File"}
              </button>
            </section>

            {isConverting && (
              <section className="progress-box">
                <div className="spinner" />
                <p>Uploading and converting your file...</p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </section>
            )}
          </>
        )}

        {mode === "editor" && (
          <section className="editor-section">
            <section
              className={`editor-import-zone ${isEditorDragging ? "dragging" : ""}`}
              onDrop={handleEditorDrop}
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              role="button"
              tabIndex={0}
              onClick={() => editorImportInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  editorImportInputRef.current?.click();
                }
              }}
            >
              <input
                ref={editorImportInputRef}
                type="file"
                hidden
                accept=".pdf,.doc,.docx"
                onChange={(event) => importFileForEditing(event.target.files?.[0])}
              />
              <p className="drop-title">Drop PDF/Word here to edit</p>
              <p className="drop-text">or click to import (.pdf, .doc, .docx)</p>
            </section>

            <label htmlFor="editorTitle">Document Title</label>
            <input
              id="editorTitle"
              className="editor-input"
              type="text"
              value={editorTitle}
              onChange={(event) => setEditorTitle(event.target.value)}
              maxLength={100}
              placeholder="Untitled Document"
              disabled={isExporting || isImporting}
            />

            <label htmlFor="editorContent">Content</label>
            <section className="editor-layout">
              <aside className="side-rail left" aria-label="Left editor tools">
                <button type="button" className="rail-button" onClick={() => runEditorCommand("formatBlock", "<p>")} disabled={isExporting || isImporting}>
                  <span className="rail-icon">T</span>
                  <span className="rail-label">Text</span>
                </button>
                <button type="button" className="rail-button" onClick={() => runEditorCommand("insertUnorderedList")} disabled={isExporting || isImporting}>
                  <span className="rail-icon">•</span>
                  <span className="rail-label">List</span>
                </button>
                <button type="button" className="rail-button" onClick={insertImageByUrl} disabled={isExporting || isImporting}>
                  <span className="rail-icon">🖼</span>
                  <span className="rail-label">Image</span>
                </button>
              </aside>

              <section className="editor-workspace" aria-label="Document editor page">
                <div className="toolbar-strip" role="toolbar" aria-label="Document formatting toolbar">
                  <div className="toolbar-row">
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("formatBlock", "<p>")} disabled={isExporting || isImporting}><span className="tool-icon">A</span> Text</button>
                    <button type="button" className="tool-button" onClick={createLink} disabled={isExporting || isImporting}><span className="tool-icon">🔗</span> Links</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("insertUnorderedList")} disabled={isExporting || isImporting}><span className="tool-icon">☰</span> Forms</button>
                    <button type="button" className="tool-button" onClick={insertImageByUrl} disabled={isExporting || isImporting}><span className="tool-icon">🖼</span> Images</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("underline")} disabled={isExporting || isImporting}><span className="tool-icon">✍</span> Sign</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("removeFormat")} disabled={isExporting || isImporting}><span className="tool-icon">⊘</span> Without</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("hiliteColor", "#fff2a8")} disabled={isExporting || isImporting}><span className="tool-icon">✎</span> Annotate</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("bold")} disabled={isExporting || isImporting}><span className="tool-icon">⬚</span> Shapes</button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("undo")} disabled={isExporting || isImporting}><span className="tool-icon">↶</span> Undo</button>
                  </div>
                  <div className="toolbar-row compact">
                    <span className="page-marker">1</span>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("justifyLeft")} disabled={isExporting || isImporting}><span className="tool-icon">⇤</span></button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("justifyCenter")} disabled={isExporting || isImporting}><span className="tool-icon">↔</span></button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("justifyRight")} disabled={isExporting || isImporting}><span className="tool-icon">⇥</span></button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("redo")} disabled={isExporting || isImporting}><span className="tool-icon">↷</span></button>
                    <button type="button" className="tool-button" onClick={() => runEditorCommand("insertParagraph")} disabled={isExporting || isImporting}><span className="tool-icon">＋</span> Insert page here</button>
                  </div>
                </div>

                <div className="find-replace-bar" aria-label="Find and replace controls">
                  <input
                    type="text"
                    className="find-input"
                    placeholder="Find text"
                    value={findText}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFindText(value);
                      applyFindHighlights(value);
                    }}
                    disabled={isExporting || isImporting}
                  />
                  <input
                    type="text"
                    className="find-input"
                    placeholder="Replace with"
                    value={replaceText}
                    onChange={(event) => setReplaceText(event.target.value)}
                    disabled={isExporting || isImporting}
                  />
                  <button type="button" className="tool-button" onClick={() => jumpToMatch(-1)} disabled={isExporting || isImporting || findMatchCount === 0}>Prev</button>
                  <button type="button" className="tool-button" onClick={() => jumpToMatch(1)} disabled={isExporting || isImporting || findMatchCount === 0}>Next</button>
                  <button type="button" className="tool-button" onClick={replaceCurrentMatch} disabled={isExporting || isImporting || findMatchCount === 0}>Replace</button>
                  <button type="button" className="tool-button" onClick={replaceAllMatches} disabled={isExporting || isImporting || findMatchCount === 0}>Replace All</button>
                  <span className="find-count">{findMatchCount > 0 ? `${activeMatchIndex + 1}/${findMatchCount}` : "0/0"}</span>
                  <button type="button" className={`tool-button option-toggle ${matchCase ? "active" : ""}`} onClick={() => setMatchCase((prev) => !prev)} disabled={isExporting || isImporting}>Match Case</button>
                  <button type="button" className={`tool-button option-toggle ${wholeWord ? "active" : ""}`} onClick={() => setWholeWord((prev) => !prev)} disabled={isExporting || isImporting}>Whole Word</button>
                  <button type="button" className={`tool-button option-toggle ${ignoreSpaces ? "active" : ""}`} onClick={() => setIgnoreSpaces((prev) => !prev)} disabled={isExporting || isImporting}>Ignore Spaces</button>
                </div>

                <div className="page-canvas">
                  <div className="page-break-guide">A4 preview with auto page breaks</div>
                  <div className="page-viewport" style={{ "--zoom-scale": editorZoom / 100 }}>
                    <div
                      id="editorContent"
                      ref={editorRef}
                      className="editor-paper"
                      contentEditable={!isExporting && !isImporting}
                      suppressContentEditableWarning
                      onInput={() => {
                        setEditorHtml(getCleanEditorHtml());
                        if (findText.trim()) {
                          applyFindHighlights(findText);
                        }
                      }}
                    />
                  </div>
                </div>
              </section>

              <aside className="side-rail right" aria-label="Right editor tools">
                <button type="button" className="rail-button" onClick={() => setZoom(editorZoom + 10)} disabled={isExporting || isImporting}>
                  <span className="rail-icon">＋</span>
                  <span className="rail-label">Zoom In</span>
                </button>
                <button type="button" className="rail-button" onClick={() => setZoom(editorZoom - 10)} disabled={isExporting || isImporting}>
                  <span className="rail-icon">－</span>
                  <span className="rail-label">Zoom Out</span>
                </button>
                <button type="button" className="rail-button" onClick={() => setZoom(100)} disabled={isExporting || isImporting}>
                  <span className="rail-icon">◻</span>
                  <span className="rail-label">{editorZoom}%</span>
                </button>
              </aside>
            </section>

            <div className="editor-actions">
              <button type="button" onClick={() => exportEditor("pdf")} disabled={isExporting || isImporting}>
                {isExporting ? "Exporting..." : "Export as PDF"}
              </button>
              <button type="button" onClick={() => exportEditor("docx")} disabled={isExporting || isImporting}>
                {isExporting ? "Exporting..." : "Export as Word"}
              </button>
            </div>

            {isImporting && (
              <section className="progress-box">
                <div className="spinner" />
                <p>Importing file into editor...</p>
              </section>
            )}
          </section>
        )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {downloadData && (
          <a className="download-button" href={downloadData.url} download={downloadData.fileName}>
            Download Converted File
          </a>
        )}
      </main>
    </div>
  );
}

async function getErrorMessage(error, fallback) {
  try {
    if (!error?.response?.data) {
      return fallback;
    }

    const text = await error.response.data.text();
    const parsed = JSON.parse(text);
    return parsed.error || fallback;
  } catch {
    return fallback;
  }
}

function htmlToPlainText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "", "text/html");
  return doc.body.textContent || "";
}

function textToHtml(text) {
  const lines = (text || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return "<p></p>";
  }

  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getApiErrorMessage(error, fallback) {
  try {
    if (!error?.response) {
      return "Cannot reach backend server. Make sure Python API is running on http://localhost:5000.";
    }

    const data = error.response.data;
    if (!data) {
      return fallback;
    }

    if (data.error) {
      return data.error;
    }

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const messages = data.detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join("; ");
      return messages || fallback;
    }

    if (data instanceof Blob) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed.error || parsed.detail || fallback;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function getFileNameFromDisposition(disposition) {
  if (!disposition) {
    return "";
  }

  const match = disposition.match(/filename="?([^\";]+)"?/i);
  return match ? match[1] : "";
}

export default App;
