(() => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const state = {
    pdfBytes: null,
    pdfDoc: null,
    sourceFile: null,
    currentPage: 1,
    currentFileName: "bolunmus",
    renderNonce: 0,
    pageSlices: [],
    totalRegions: 0,
    markerHits: 0,
  };

  const els = {
    pdfInput: document.getElementById("pdfInput"),
    splitBtn: document.getElementById("splitBtn"),
    detectBtn: document.getElementById("detectBtn"),
    prevPage: document.getElementById("prevPage"),
    nextPage: document.getElementById("nextPage"),
    pageInfo: document.getElementById("pageInfo"),
    status: document.getElementById("status"),
    detectionSummary: document.getElementById("detectionSummary"),
    detectionList: document.getElementById("detectionList"),
    canvasWrap: document.getElementById("canvasWrap"),
    pdfCanvas: document.getElementById("pdfCanvas"),
    overlayCanvas: document.getElementById("overlayCanvas"),
  };

  const pdfCtx = els.pdfCanvas.getContext("2d");
  const overlayCtx = els.overlayCanvas.getContext("2d");

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setStatus(message, kind = "info") {
    els.status.textContent = message;
    els.status.classList.remove("error", "success");
    if (kind === "error") {
      els.status.classList.add("error");
    }
    if (kind === "success") {
      els.status.classList.add("success");
    }
  }

  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function hasSlipMarker(text) {
    return /\bPUSULASI\b/.test(normalizeText(text));
  }

  function dedupeCloseNumbers(values, tolerance = 6) {
    if (!values.length) {
      return [];
    }

    const sorted = [...values].sort((a, b) => a - b);
    const result = [sorted[0]];

    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.abs(sorted[i] - result[result.length - 1]) > tolerance) {
        result.push(sorted[i]);
      }
    }

    return result;
  }

  function fitScale(rawWidth) {
    const wrapWidth = els.canvasWrap.clientWidth || window.innerWidth - 32;
    const desired = (wrapWidth - 24) / rawWidth;
    return clamp(desired, 0.45, 2.5);
  }

  function syncCanvasSize(width, height) {
    els.pdfCanvas.width = width;
    els.pdfCanvas.height = height;
    els.overlayCanvas.width = width;
    els.overlayCanvas.height = height;

    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;

    els.pdfCanvas.style.width = cssWidth;
    els.pdfCanvas.style.height = cssHeight;
    els.overlayCanvas.style.width = cssWidth;
    els.overlayCanvas.style.height = cssHeight;
  }

  function updateButtons() {
    const hasPdf = !!state.pdfDoc;

    els.detectBtn.disabled = !hasPdf;
    els.splitBtn.disabled = !(hasPdf && state.totalRegions > 0);

    if (!hasPdf) {
      els.prevPage.disabled = true;
      els.nextPage.disabled = true;
      return;
    }

    els.prevPage.disabled = state.currentPage <= 1;
    els.nextPage.disabled = state.currentPage >= state.pdfDoc.numPages;
  }

  function updatePageInfo() {
    if (!state.pdfDoc) {
      els.pageInfo.textContent = "Sayfa - / -";
      return;
    }
    els.pageInfo.textContent = `Sayfa ${state.currentPage} / ${state.pdfDoc.numPages}`;
  }

  function updateDetectionList() {
    if (!state.pdfDoc) {
      els.detectionSummary.textContent = "Toplam 0 bordro";
      els.detectionList.innerHTML = '<li class="empty">Henuz algilama yapilmadi.</li>';
      return;
    }

    els.detectionSummary.textContent = `Toplam ${state.totalRegions} bordro`;

    const rows = state.pageSlices.map((slice, idx) => {
      const mode = slice.markerCount > 0 ? "basliktan algilandi" : "tum sayfa kabul edildi";
      return `<li>Sayfa ${idx + 1}: ${slice.regions.length} bordro (${mode})</li>`;
    });

    els.detectionList.innerHTML = rows.length
      ? rows.join("")
      : '<li class="empty">Algilanabilir bordro bulunamadi.</li>';
  }

  function ratioToPixelRect(region) {
    return {
      x: region.xRatio * els.overlayCanvas.width,
      y: region.yRatio * els.overlayCanvas.height,
      w: region.wRatio * els.overlayCanvas.width,
      h: region.hRatio * els.overlayCanvas.height,
    };
  }

  function drawRegionLabel(text, x, y) {
    overlayCtx.font = "bold 13px Segoe UI";
    overlayCtx.fillStyle = "#0b58c8";
    overlayCtx.fillText(text, x, y);
  }

  function redrawOverlay() {
    overlayCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

    if (!state.pdfDoc || !state.pageSlices.length) {
      return;
    }

    const current = state.pageSlices[state.currentPage - 1];
    if (!current) {
      return;
    }

    overlayCtx.lineWidth = 2;
    overlayCtx.strokeStyle = "#0e6efb";
    overlayCtx.fillStyle = "rgba(14, 110, 251, 0.13)";

    current.regions.forEach((region, index) => {
      const rect = ratioToPixelRect(region);
      overlayCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      overlayCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      drawRegionLabel(`Bordro ${index + 1}`, rect.x + 8, rect.y + 16);
    });
  }

  async function renderCurrentPage() {
    if (!state.pdfDoc) {
      return;
    }

    const nonce = ++state.renderNonce;
    const page = await state.pdfDoc.getPage(state.currentPage);
    if (nonce !== state.renderNonce) {
      return;
    }

    const rawViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: fitScale(rawViewport.width) });

    syncCanvasSize(Math.floor(viewport.width), Math.floor(viewport.height));

    pdfCtx.clearRect(0, 0, els.pdfCanvas.width, els.pdfCanvas.height);
    await page.render({ canvasContext: pdfCtx, viewport }).promise;

    updatePageInfo();
    updateButtons();
    redrawOverlay();
  }

  async function detectRegionsForPage(page) {
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    const textContent = await page.getTextContent();
    const starts = [];

    for (const item of textContent.items) {
      if (!item || typeof item.str !== "string") {
        continue;
      }

      if (!hasSlipMarker(item.str)) {
        continue;
      }

      const y = Array.isArray(item.transform) ? item.transform[5] : 0;
      const top = clamp(pageHeight - y, 0, pageHeight);
      starts.push(top);
    }

    const uniqueStarts = dedupeCloseNumbers(starts, 6);

    if (!uniqueStarts.length) {
      return {
        markerCount: 0,
        regions: [{ xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }],
      };
    }

    const START_PADDING = 10;
    const END_PADDING = 8;
    const MIN_HEIGHT = 80;

    const regions = [];

    for (let i = 0; i < uniqueStarts.length; i += 1) {
      const segmentTop = clamp(uniqueStarts[i] - START_PADDING, 0, pageHeight);
      const nextTop = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1] : pageHeight;
      const segmentBottom = clamp(nextTop - END_PADDING, segmentTop + 1, pageHeight);

      if (segmentBottom - segmentTop < MIN_HEIGHT) {
        continue;
      }

      regions.push({
        xRatio: 0,
        yRatio: segmentTop / pageHeight,
        wRatio: 1,
        hRatio: (segmentBottom - segmentTop) / pageHeight,
      });
    }

    if (!regions.length) {
      return {
        markerCount: uniqueStarts.length,
        regions: [{ xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }],
      };
    }

    return {
      markerCount: uniqueStarts.length,
      regions,
    };
  }

  async function detectAllRegions() {
    if (!state.pdfDoc) {
      return;
    }

    setStatus("Bordro alanlari otomatik algilaniyor...");

    const pageSlices = [];
    let markerHits = 0;
    let totalRegions = 0;

    for (let pageNo = 1; pageNo <= state.pdfDoc.numPages; pageNo += 1) {
      const page = await state.pdfDoc.getPage(pageNo);
      const slice = await detectRegionsForPage(page);

      pageSlices.push(slice);
      markerHits += slice.markerCount;
      totalRegions += slice.regions.length;
    }

    state.pageSlices = pageSlices;
    state.markerHits = markerHits;
    state.totalRegions = totalRegions;

    updateDetectionList();
    updateButtons();
    redrawOverlay();

    if (!markerHits) {
      setStatus(
        "Baslik bulunamadi. Guvenli modda her sayfa tek bordro kabul edildi.",
        "error",
      );
      return;
    }

    setStatus(`Algilama tamamlandi. ${totalRegions} bordro bulundu.`, "success");
  }

  function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function splitAndDownload() {
    if (!state.pdfDoc || !state.pageSlices.length) {
      return;
    }

    els.splitBtn.disabled = true;
    setStatus("PDF bolunuyor. Lutfen bekleyin...");

    try {
      let sourceBytes = state.pdfBytes;
      if (!(sourceBytes instanceof Uint8Array) || sourceBytes.length < 8) {
        if (!state.sourceFile) {
          throw new Error("Kaynak PDF byte verisi bulunamadi.");
        }
        sourceBytes = new Uint8Array(await state.sourceFile.arrayBuffer());
        state.pdfBytes = sourceBytes;
      }

      const outDoc = await PDFLib.PDFDocument.create();
      const pageIndexes = Array.from({ length: state.pdfDoc.numPages }, (_, i) => i);
      const embeddedPages = await outDoc.embedPdf(sourceBytes, pageIndexes);

      let createdPages = 0;

      embeddedPages.forEach((embeddedPage, pageIndex) => {
        const slices = state.pageSlices[pageIndex]?.regions || [
          { xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 },
        ];

        const pageW = embeddedPage.width;
        const pageH = embeddedPage.height;

        slices.forEach((region) => {
          const x = region.xRatio * pageW;
          const top = region.yRatio * pageH;
          const w = region.wRatio * pageW;
          const h = region.hRatio * pageH;
          const y = pageH - top - h;

          if (w <= 1 || h <= 1) {
            return;
          }

          const outPage = outDoc.addPage([w, h]);
          outPage.drawPage(embeddedPage, {
            x: -x,
            y: -y,
            width: pageW,
            height: pageH,
          });
          createdPages += 1;
        });
      });

      if (!createdPages) {
        throw new Error("Bolme icin uygun bordro alani bulunamadi.");
      }

      const outputBytes = await outDoc.save();
      const name = `${state.currentFileName}_bolunmus.pdf`;
      downloadPdf(outputBytes, name);

      setStatus(`${createdPages} adet bordro sayfasi olusturuldu.`, "success");
    } catch (error) {
      console.error(error);
      setStatus(`Islem basarisiz: ${error.message || String(error)}`, "error");
    } finally {
      updateButtons();
    }
  }

  async function onFileInputChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus("PDF yukleniyor...");

    try {
      const buffer = await file.arrayBuffer();
      const bytesForPdfJs = new Uint8Array(buffer.slice(0));
      const bytesForSplit = new Uint8Array(buffer.slice(0));
      const loadingTask = pdfjsLib.getDocument({ data: bytesForPdfJs });
      const doc = await loadingTask.promise;

      state.pdfBytes = bytesForSplit;
      state.pdfDoc = doc;
      state.sourceFile = file;
      state.currentPage = 1;
      state.currentFileName = file.name.replace(/\.pdf$/i, "") || "bolunmus";
      state.pageSlices = [];
      state.totalRegions = 0;
      state.markerHits = 0;

      updatePageInfo();
      updateDetectionList();
      updateButtons();

      await detectAllRegions();
      await renderCurrentPage();
    } catch (error) {
      console.error(error);
      setStatus(`PDF acilamadi: ${error.message || String(error)}`, "error");
    }
  }

  function bindEvents() {
    els.pdfInput.addEventListener("change", onFileInputChange);

    els.detectBtn.addEventListener("click", async () => {
      if (!state.pdfDoc) {
        return;
      }
      await detectAllRegions();
      await renderCurrentPage();
    });

    els.splitBtn.addEventListener("click", splitAndDownload);

    els.prevPage.addEventListener("click", async () => {
      if (!state.pdfDoc || state.currentPage <= 1) {
        return;
      }
      state.currentPage -= 1;
      await renderCurrentPage();
    });

    els.nextPage.addEventListener("click", async () => {
      if (!state.pdfDoc || state.currentPage >= state.pdfDoc.numPages) {
        return;
      }
      state.currentPage += 1;
      await renderCurrentPage();
    });

    window.addEventListener("resize", async () => {
      if (!state.pdfDoc) {
        return;
      }
      await renderCurrentPage();
    });
  }

  bindEvents();
  updateButtons();
  updatePageInfo();
  updateDetectionList();
  redrawOverlay();
})();
