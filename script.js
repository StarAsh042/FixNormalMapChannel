document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const fileName = document.getElementById('fileName');
    const fixBtn = document.getElementById('fixBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    
    const originalCanvas = document.getElementById('originalCanvas');
    const processedCanvas = document.getElementById('processedCanvas');
    const ctxOriginal = originalCanvas.getContext('2d', { willReadFrequently: true });
    const ctxProcessed = processedCanvas.getContext('2d', { willReadFrequently: true });
    
    const originalRes = document.getElementById('originalRes');
    const fixedRes = document.getElementById('fixedRes');
    const logArea = document.getElementById('logArea');
    const historyList = document.getElementById('historyList');
    const originalChannels = document.getElementById('originalChannels');
    const fixedChannels = document.getElementById('fixedChannels');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = document.getElementById('progressLabel');

    let currentImage = null;
    let currentFileType = '';

    // Helper to log messages
    function log(msg) {
        if (logArea) {
            const div = document.createElement('div');
            div.className = 'log-item';
            div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            logArea.appendChild(div);
            logArea.scrollTop = logArea.scrollHeight;
        } else {
            console.log(msg);
        }
    }

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (!file.type.match('image.*')) {
                log('Error: Not an image file.');
                return;
            }
            fileName.textContent = file.name;
            currentFileType = file.type || '';
            loadImage(file);
        }
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                currentImage = img;
                renderOriginal(img);
                fixBtn.disabled = false;
                downloadBtn.disabled = true; // Disable download until fixed
                log(`Loaded image: ${file.name} (${img.width}x${img.height})`);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function renderOriginal(img) {
        // Set canvas size to image size
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        
        ctxOriginal.drawImage(img, 0, 0);
        originalCanvas.style.display = 'block';
        originalRes.textContent = `${img.width} x ${img.height}`;
        updateChannelBadgesOriginal();
        
        // Clear processed canvas
        processedCanvas.width = img.width;
        processedCanvas.height = img.height;
        ctxProcessed.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
        processedCanvas.style.display = 'none';
        fixedRes.textContent = '';
        fixedChannels.textContent = '';
        if (fixedChannels) fixedChannels.style.display = 'none';
        
        // Hide empty state text
        originalCanvas.nextElementSibling.style.display = 'none';
    }

    fixBtn.addEventListener('click', () => {
        if (!currentImage) return;
        
        log('Processing image...');
        processImageWithProgress();
    });

    function processImageWithProgress() {
        const w = originalCanvas.width;
        const h = originalCanvas.height;
        
        const srcImageData = ctxOriginal.getImageData(0, 0, w, h);
        const dstImageData = ctxProcessed.createImageData(w, h);
        
        const src = srcImageData.data;
        const dst = dstImageData.data;
        let row = 0;
        let lastPct = -1;
        let lastLabelTs = 0;
        const start = performance.now();
        const targetDuration = 1000;
        let imageDone = false;
        if (progressFill) {
            progressFill.style.transition = 'none';
            progressFill.style.transform = 'scaleX(0)';
            void progressFill.offsetWidth;
            progressFill.style.transition = `transform ${targetDuration}ms linear`;
            requestAnimationFrame(() => {
                progressFill.style.transform = 'scaleX(1)';
            });
        }
        if (progressLabel) progressLabel.textContent = '生成中... 0%';
        // hide processed preview until both work and time gates complete
        processedCanvas.style.display = 'none';
        if (processedCanvas.nextElementSibling) {
            processedCanvas.nextElementSibling.style.display = 'block';
        }
        if (fixedChannels) {
            fixedChannels.textContent = '正在生成...';
            fixedChannels.classList.add('pending');
            fixedChannels.style.display = 'inline-block';
        }
        fixBtn.disabled = true;
        function step() {
            const frameStart = performance.now();
            const budget = 12;
            if (row < h) {
                while (row < h && (performance.now() - frameStart) < budget) {
                    const base = row * w * 4;
                    for (let x = 0; x < w; x++) {
                        const i = base + x * 4;
                        const r = src[i];
                        const g = src[i+1];
                        const a = src[i+3];
                        dst[i] = a;
                        dst[i+1] = 255 - g;
                        dst[i+2] = r;
                        dst[i+3] = 255;
                    }
                    row++;
                }
                if (row >= h && !imageDone) {
                    // work completed; defer showing result until time gate finishes
                    imageDone = true;
                }
            }
            const elapsed = performance.now() - start;
            const timePct = Math.min(100, Math.round((elapsed / targetDuration) * 100));
            const workPct = Math.round((row / h) * 100);
            const pct = Math.min(timePct, workPct);
            if (pct !== lastPct) lastPct = pct;
            const now = performance.now();
            if (progressLabel && (pct === 100 || (now - lastLabelTs) > 120)) {
                progressLabel.textContent = '生成中... ' + pct + '%';
                lastLabelTs = now;
            }
            if (row < h || elapsed < targetDuration) {
                requestAnimationFrame(step);
            } else {
                // both work and time conditions satisfied; now reveal processed image
                ctxProcessed.putImageData(dstImageData, 0, 0);
                processedCanvas.style.display = 'block';
                if (processedCanvas.nextElementSibling) {
                    processedCanvas.nextElementSibling.style.display = 'none';
                }
                fixedRes.textContent = `${w} x ${h}`;
                fixedChannels.textContent = 'RGB';
                if (fixedChannels) {
                    fixedChannels.classList.remove('pending');
                    fixedChannels.style.display = 'inline-block';
                }
                downloadBtn.disabled = false;
                const elapsed = Math.round(performance.now() - start);
                if (progressLabel) progressLabel.textContent = '生成耗时: ' + elapsed + ' ms';
                log('Image processed successfully.');
                addToHistory();
                fixBtn.disabled = false;
            }
        }
        requestAnimationFrame(step);
    }

    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'fixed_' + (fileName.textContent !== '未选择文件' ? fileName.textContent : 'image.png');
        link.href = processedCanvas.toDataURL('image/png');
        link.click();
        log('Download started.');
    });

    // Click to open full preview in new tab
    [originalCanvas, processedCanvas].forEach(canvas => {
        canvas.addEventListener('click', () => {
            if (canvas.style.display !== 'block') return;
            const dataUrl = canvas.toDataURL('image/png');
            const win = window.open();
            if (win) {
                win.document.write(`<img src="${dataUrl}" style="max-width:100%;height:auto;"/>`);
            } else {
                log('Popup blocked. Please allow popups to view full preview.');
            }
        });
    });

    function updateChannelBadgesOriginal() {
        if (currentFileType === 'image/jpeg') {
            originalChannels.textContent = 'RGB';
            return;
        }
        if (currentFileType === 'image/png') {
            const w = originalCanvas.width;
            const h = originalCanvas.height;
            const step = Math.max(1, Math.floor((w * h) / 50000));
            const data = ctxOriginal.getImageData(0, 0, w, h).data;
            let hasAlpha = false;
            for (let i = 3; i < data.length; i += 4 * step) {
                if (data[i] !== 255) {
                    hasAlpha = true;
                    break;
                }
            }
            originalChannels.textContent = hasAlpha ? 'RGBA' : 'RGB';
            return;
        }
        originalChannels.textContent = 'RGB';
    }

    function addToHistory() {
        const item = document.createElement('div');
        item.className = 'history-item';

        const thumb = document.createElement('img');
        thumb.className = 'history-thumb';
        thumb.src = processedCanvas.toDataURL('image/png');

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const dl = document.createElement('button');
        dl.className = 'btn secondary-btn';
        dl.textContent = '下载';
        dl.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = 'fixed_' + (fileName.textContent !== '未选择文件' ? fileName.textContent : 'image.png');
            link.href = processedCanvas.toDataURL('image/png');
            link.click();
        });
        actions.appendChild(dl);

        const meta = document.createElement('div');
        meta.className = 'history-meta';
        const name = document.createElement('div');
        name.textContent = fileName.textContent;
        const info = document.createElement('div');
        info.textContent = fixedRes.textContent + ' · ' + new Date().toLocaleTimeString();
        info.style.color = '#94a3b8';
        info.style.fontSize = '12px';
        meta.appendChild(name);
        meta.appendChild(info);

        item.appendChild(thumb);
        item.appendChild(actions);
        item.appendChild(meta);
        historyList.prepend(item);
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            historyList.innerHTML = '';
            log('History cleared.');
        });
    }
}); 
