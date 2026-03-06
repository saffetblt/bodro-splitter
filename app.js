(() => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const state = {
    selectedFile: null,
    outputBytes: null,
    outputFileName: "",
    busy: false,
    lastProgressPhase: "idle",
  };

  const els = {
    pdfInput: document.getElementById("pdfInput"),
    pickBtn: document.getElementById("pickBtn"),
    dropArea: document.getElementById("dropArea"),
    fileName: document.getElementById("fileName"),
    splitBtn: document.getElementById("splitBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    statusTitle: document.getElementById("statusTitle"),
    statusBadge: document.getElementById("statusBadge"),
    statusMessage: document.getElementById("statusMessage"),
    progressFill: document.getElementById("progressFill"),
    stepLoad: document.getElementById("stepLoad"),
    stepDetect: document.getElementById("stepDetect"),
    stepSplit: document.getElementById("stepSplit"),
  };

  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function hasSlipMarker(text) {
    return /\bPUSULASI\b/.test(normalizeText(text));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function setStepClasses(phase) {
    const all = [els.stepLoad, els.stepDetect, els.stepSplit];
    all.forEach((el) => {
      el.classList.remove("pending", "active", "done", "error");
      el.classList.add("pending");
    });

    if (phase === "idle") {
      return;
    }

    if (phase === "loading") {
      state.lastProgressPhase = "loading";
      els.stepLoad.classList.remove("pending");
      els.stepLoad.classList.add("active");
      return;
    }

    if (phase === "detecting") {
      state.lastProgressPhase = "detecting";
      els.stepLoad.classList.remove("pending");
      els.stepLoad.classList.add("done");
      els.stepDetect.classList.remove("pending");
      els.stepDetect.classList.add("active");
      return;
    }

    if (phase === "splitting") {
      state.lastProgressPhase = "splitting";
      els.stepLoad.classList.remove("pending");
      els.stepDetect.classList.remove("pending");
      els.stepLoad.classList.add("done");
      els.stepDetect.classList.add("done");
      els.stepSplit.classList.remove("pending");
      els.stepSplit.classList.add("active");
      return;
    }

    if (phase === "done") {
      state.lastProgressPhase = "done";
      all.forEach((el) => {
        el.classList.remove("pending", "active", "error");
        el.classList.add("done");
      });
      return;
    }

    if (phase === "error") {
      const failingStep =
        state.lastProgressPhase === "splitting"
          ? els.stepSplit
          : state.lastProgressPhase === "detecting"
            ? els.stepDetect
            : els.stepLoad;

      if (failingStep !== els.stepLoad) {
        els.stepLoad.classList.remove("pending");
        els.stepLoad.classList.add("done");
      }

      if (failingStep === els.stepSplit) {
        els.stepDetect.classList.remove("pending");
        els.stepDetect.classList.add("done");
      }

      failingStep.classList.remove("pending", "active", "done");
      failingStep.classList.add("error");
    }
  }

  function setStatus({ title, badge, badgeClass, message, progress, phase }) {
    els.statusTitle.textContent = title;
    els.statusBadge.textContent = badge;
    els.statusBadge.className = `badge ${badgeClass}`;
    els.statusMessage.textContent = message;
    els.progressFill.style.width = `${clamp(progress, 0, 100)}%`;
    setStepClasses(phase);
  }

  function setIdleStatus() {
    setStatus({
      title: "Hazır",
      badge: "Bekleniyor",
      badgeClass: "idle",
      message: "Bir PDF seçip işlemi başlatın.",
      progress: 0,
      phase: "idle",
    });
  }

  function updateButtons() {
    els.splitBtn.disabled = !state.selectedFile || state.busy;
    els.downloadBtn.disabled = !state.outputBytes || state.busy;
  }

  function setSelectedFile(file) {
    state.selectedFile = file;
    state.outputBytes = null;
    state.outputFileName = "";

    if (!file) {
      els.fileName.textContent = "Henüz dosya seçilmedi.";
      setIdleStatus();
      updateButtons();
      return;
    }

    els.fileName.textContent = `Seçilen dosya: ${file.name}`;

    setStatus({
      title: "Dosya Hazır",
      badge: "Başlamadı",
      badgeClass: "idle",
      message: "Bordroları Otomatik Böl butonuna basarak işlemi başlatın.",
      progress: 0,
      phase: "idle",
    });

    updateButtons();
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
      return [{ xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }];
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
      return [{ xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }];
    }

    return regions;
  }

  async function detectAllRegions(pdfDoc) {
    const pageSlices = [];

    for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo += 1) {
      const page = await pdfDoc.getPage(pageNo);
      const regions = await detectRegionsForPage(page);
      pageSlices.push(regions);

      const detectionProgress = 30 + Math.round((pageNo / pdfDoc.numPages) * 35);
      setStatus({
        title: "Algılanıyor",
        badge: "Çalışıyor",
        badgeClass: "running",
        message: `${pageNo}/${pdfDoc.numPages} sayfa tarandı.`,
        progress: detectionProgress,
        phase: "detecting",
      });
    }

    return pageSlices;
  }

  async function splitPdf(sourceBytes, pageSlices, pageCount) {
    const outDoc = await PDFLib.PDFDocument.create();
    const pageIndexes = Array.from({ length: pageCount }, (_, i) => i);
    const embeddedPages = await outDoc.embedPdf(sourceBytes, pageIndexes);

    let createdPages = 0;

    embeddedPages.forEach((embeddedPage, pageIndex) => {
      const regions = pageSlices[pageIndex] || [{ xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }];
      const pageW = embeddedPage.width;
      const pageH = embeddedPage.height;

      regions.forEach((region) => {
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
      throw new Error("Bölünecek uygun bordro alanı bulunamadı.");
    }

    const outputBytes = await outDoc.save();
    return { outputBytes, createdPages };
  }

  async function processPdf() {
    if (!state.selectedFile) {
      return;
    }

    state.busy = true;
    state.outputBytes = null;
    updateButtons();

    try {
      setStatus({
        title: "Yükleniyor",
        badge: "Çalışıyor",
        badgeClass: "running",
        message: "PDF dosyası okunuyor...",
        progress: 12,
        phase: "loading",
      });

      const buffer = await state.selectedFile.arrayBuffer();
      const bytesForPdfJs = new Uint8Array(buffer.slice(0));
      const bytesForSplit = new Uint8Array(buffer.slice(0));

      const loadingTask = pdfjsLib.getDocument({ data: bytesForPdfJs });
      const pdfDoc = await loadingTask.promise;

      setStatus({
        title: "Algılanıyor",
        badge: "Çalışıyor",
        badgeClass: "running",
        message: "Bordro başlıkları taranıyor...",
        progress: 30,
        phase: "detecting",
      });

      const pageSlices = await detectAllRegions(pdfDoc);
      const totalRegions = pageSlices.reduce((acc, regions) => acc + regions.length, 0);

      setStatus({
        title: "Bölünüyor",
        badge: "Çalışıyor",
        badgeClass: "running",
        message: "PDF parçalara ayrılıyor...",
        progress: 75,
        phase: "splitting",
      });

      const { outputBytes, createdPages } = await splitPdf(bytesForSplit, pageSlices, pdfDoc.numPages);

      state.outputBytes = outputBytes;
      state.outputFileName = `${state.selectedFile.name.replace(/\.pdf$/i, "")}_bolunmus.pdf`;

      setStatus({
        title: "Tamamlandı",
        badge: "Hazır",
        badgeClass: "done",
        message: `İşlem tamamlandı. ${totalRegions} bordro algılandı, ${createdPages} sayfa üretildi. İndir butonunu kullanabilirsiniz.`,
        progress: 100,
        phase: "done",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        title: "Hata",
        badge: "Başarısız",
        badgeClass: "error",
        message: `İşlem başarısız: ${error.message || String(error)}`,
        progress: 100,
        phase: "error",
      });
    } finally {
      state.busy = false;
      updateButtons();
    }
  }

  function downloadOutput() {
    if (!state.outputBytes) {
      return;
    }

    const blob = new Blob([state.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = state.outputFileName || "bordrolar_bolunmus.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleIncomingFile(file) {
    if (!file) {
      return;
    }

    const lower = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");

    if (!isPdf) {
      setStatus({
        title: "Hata",
        badge: "Geçersiz Dosya",
        badgeClass: "error",
        message: "Lütfen sadece PDF dosyası seçin.",
        progress: 0,
        phase: "error",
      });
      return;
    }

    setSelectedFile(file);
  }

  function bindEvents() {
    els.pickBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      els.pdfInput.click();
    });

    els.dropArea.addEventListener("click", () => {
      els.pdfInput.click();
    });

    els.dropArea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        els.pdfInput.click();
      }
    });

    els.pdfInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      handleIncomingFile(file);
    });

    els.dropArea.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.dropArea.classList.add("drag-over");
    });

    els.dropArea.addEventListener("dragleave", () => {
      els.dropArea.classList.remove("drag-over");
    });

    els.dropArea.addEventListener("drop", (event) => {
      event.preventDefault();
      els.dropArea.classList.remove("drag-over");
      const file = event.dataTransfer?.files?.[0] || null;
      handleIncomingFile(file);
    });

    els.splitBtn.addEventListener("click", processPdf);
    els.downloadBtn.addEventListener("click", downloadOutput);
  }

  bindEvents();
  setIdleStatus();
  updateButtons();
})();
