// Attachment Processor Module
// Handles extraction of text content from various file types

let nodeZlib = null;
try {
    nodeZlib = require('node:zlib');
} catch (_error) {
    nodeZlib = null;
}

class AttachmentProcessor {
    constructor() {
        this.supportedTypes = {
            pdf: ['application/pdf', '.pdf'],
            word: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx', '.doc'],
            excel: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', '.xls'],
            text: ['text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values', '.txt', '.md', '.csv', '.tsv'],
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', '.jpg', '.jpeg', '.png', '.gif', '.webp'],
            link: ['http://', 'https://']
        };
    }

    sanitizeErrorMessage(error) {
        const message = error && error.message ? error.message : String(error || 'Attachment processing failed');
        return message
            .replace(/https?:\/\/[^\s)]+/gi, '[url redacted]')
            .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
            .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]')
            .replace(/(api[_-]?key|token)(\s*[:=]\s*)([A-Za-z0-9._~+/=-]+)/gi, '$1$2[redacted]')
            .slice(0, 240);
    }

    // Bounded active-popup path: only fetch small HTTPS text-like attachments after the user enables it.
    async processSafeTextAttachments(attachments, options = {}) {
        const source = Array.isArray(attachments) ? attachments : [];
        const limits = {
            maxAttachments: this.clampNumber(options.maxAttachments, 5, 1, 12),
            maxBytes: this.clampNumber(options.maxBytes, 200000, 10000, 500000),
            maxExtractedCharacters: this.clampNumber(options.maxExtractedCharacters, 3000, 500, 10000),
            timeoutMs: this.clampNumber(options.timeoutMs, 10000, 1000, 30000)
        };
        let attempted = 0;
        let extracted = 0;
        let failed = 0;

        const processed = [];
        for (const attachment of source.slice(0, 25)) {
            if (!this.isSafeExtractableAttachment(attachment)) {
                processed.push(this.metadataOnlyAttachment(attachment, 'not-text-like'));
                continue;
            }

            if (attempted >= limits.maxAttachments) {
                processed.push(this.metadataOnlyAttachment(attachment, 'text-extraction-limit'));
                continue;
            }

            attempted += 1;
            try {
                const result = await this.processSafeTextAttachment(attachment, limits);
                extracted += result.extractedText ? 1 : 0;
                processed.push(result);
            } catch (error) {
                failed += 1;
                processed.push({
                    ...attachment,
                    processed: false,
                    type: this.detectType(attachment),
                    extractionStatus: 'failed',
                    error: error.message,
                    extractedText: '',
                    content: `Text extraction failed: ${error.message}`
                });
            }
        }

        return {
            attachments: processed,
            status: {
                ok: failed === 0,
                attempted: attempted,
                extracted: extracted,
                failed: failed,
                skipped: Math.max(source.length - attempted, 0),
                detail: extracted
                    ? `${extracted} attachment(s) extracted with bounded HTTPS reads.`
                    : attempted
                        ? 'Attachment extraction ran, but no text was extracted.'
                        : 'No eligible text or PDF attachments were extracted.'
            }
        };
    }

    isSafeExtractableAttachment(attachment) {
        return this.isTextLikeAttachment(attachment) || this.detectType(attachment) === 'pdf';
    }

    isTextLikeAttachment(attachment) {
        const mimeType = String((attachment && (attachment.mimeType || attachment.type)) || '').toLowerCase();
        const name = String((attachment && attachment.name) || '').toLowerCase();
        const extension = this.getExtension(name);
        return /^text\//.test(mimeType) ||
            mimeType === 'application/csv' ||
            ['txt', 'md', 'csv', 'tsv'].indexOf(extension) !== -1;
    }

    async processSafeTextAttachment(attachment, limits) {
        if (this.detectType(attachment) === 'pdf') {
            return this.processSafePdfAttachment(attachment, limits);
        }

        if (!attachment || !attachment.url) {
            throw new Error('Attachment has no fetchable URL');
        }

        const knownBytes = Number(attachment.bytes || attachment.size || 0);
        if (knownBytes > limits.maxBytes) {
            throw new Error(`Attachment is larger than the ${this.formatBytes(limits.maxBytes)} text extraction cap`);
        }

        const response = await this.safeFetchAttachment(attachment.url, {
            timeoutMs: limits.timeoutMs,
            headers: { Accept: 'text/plain,text/csv,text/markdown,*/*;q=0.2' }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch text attachment: ${response.statusText || response.status}`);
        }

        const blob = await response.blob();
        if (blob.size > limits.maxBytes) {
            throw new Error(`Attachment response is larger than the ${this.formatBytes(limits.maxBytes)} text extraction cap`);
        }

        const text = await blob.text();
        const normalizedText = String(text || '').replace(/\r\n/g, '\n').replace(/\s+$/g, '');
        const extractedText = normalizedText.slice(0, limits.maxExtractedCharacters);
        const truncated = normalizedText.length > extractedText.length;
        const lines = extractedText.split('\n');

        return {
            ...attachment,
            processed: true,
            type: this.detectType(attachment),
            extractionStatus: truncated ? 'truncated' : 'text-extracted',
            extractedText: extractedText,
            content: `Text attachment: ${attachment.name || 'Attachment'}\n\n${extractedText}${truncated ? '\n\n[Content truncated before analysis]' : ''}`,
            metadata: {
                size: blob.size,
                formattedSize: this.formatBytes(blob.size),
                type: blob.type || attachment.mimeType || 'text/plain',
                originalCharacters: normalizedText.length,
                extractedCharacters: extractedText.length,
                lines: lines.length,
                truncated: truncated
            }
        };
    }

    async processSafePdfAttachment(attachment, limits) {
        if (!attachment || !attachment.url) {
            throw new Error('Attachment has no fetchable URL');
        }

        const knownBytes = Number(attachment.bytes || attachment.size || 0);
        if (knownBytes > limits.maxBytes) {
            throw new Error(`Attachment is larger than the ${this.formatBytes(limits.maxBytes)} PDF extraction cap`);
        }

        const response = await this.safeFetchAttachment(attachment.url, {
            timeoutMs: limits.timeoutMs,
            headers: { Accept: 'application/pdf,*/*;q=0.2' }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch PDF attachment: ${response.statusText || response.status}`);
        }

        const blob = await response.blob();
        if (blob.size > limits.maxBytes) {
            throw new Error(`Attachment response is larger than the ${this.formatBytes(limits.maxBytes)} PDF extraction cap`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const decodedText = this.extractTextFromPdfBuffer(arrayBuffer);
        if (!decodedText) {
            return {
                ...attachment,
                processed: false,
                type: 'pdf',
                extractionStatus: 'pdf-no-readable-text',
                extractedText: '',
                content: `PDF document: ${attachment.name || 'Attachment'}\n\nNo readable text could be extracted from this PDF within the safe browser limit.`,
                metadata: {
                    size: blob.size,
                    formattedSize: this.formatBytes(blob.size),
                    type: 'application/pdf',
                    extractedCharacters: 0,
                    truncated: false
                }
            };
        }

        const extractedText = decodedText.slice(0, limits.maxExtractedCharacters);
        const truncated = decodedText.length > extractedText.length;

        return {
            ...attachment,
            processed: true,
            type: 'pdf',
            extractionStatus: 'pdf-text-extracted',
            extractedText: extractedText,
            content: `PDF attachment: ${attachment.name || 'Attachment'}\n\n${extractedText}${truncated ? '\n\n[PDF text truncated before analysis]' : ''}`,
            metadata: {
                size: blob.size,
                formattedSize: this.formatBytes(blob.size),
                type: 'application/pdf',
                originalCharacters: decodedText.length,
                extractedCharacters: extractedText.length,
                truncated: truncated
            }
        };
    }

    metadataOnlyAttachment(attachment, reason) {
        return {
            ...attachment,
            processed: false,
            type: this.detectType(attachment),
            extractionStatus: reason || 'metadata-only',
            extractedText: attachment && attachment.extractedText ? attachment.extractedText : '',
            content: attachment && attachment.content ? attachment.content : `Attachment metadata only: ${(attachment && attachment.name) || 'Attachment'}`,
            metadata: {
                size: attachment && (attachment.bytes || attachment.size) || 0,
                formattedSize: this.formatBytes(attachment && (attachment.bytes || attachment.size) || 0)
            }
        };
    }

    // Main processing method. Defaults to bounded text extraction and metadata-only binary handling.
    async processAttachments(attachments, options = {}) {
        if (!attachments || attachments.length === 0) {
            return [];
        }

        const processed = [];
        for (const attachment of attachments) {
            try {
                const result = await this.processAttachment(attachment, options);
                processed.push(result);
            } catch (error) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(`Failed to process attachment: ${this.sanitizeErrorMessage(error)}`);
                }
                const safeError = this.sanitizeErrorMessage(error);
                processed.push({
                    ...attachment,
                    processed: false,
                    error: safeError,
                    content: `Failed to process: ${safeError}`
                });
            }
        }

        return processed;
    }

    // Process individual attachment
    async processAttachment(attachment, options = {}) {
        const type = this.detectType(attachment);

        if (this.isTextLikeAttachment(attachment)) {
            try {
                return await this.processSafeTextAttachment(attachment, this.normalizeExtractionLimits(options));
            } catch (error) {
                const safeError = this.sanitizeErrorMessage(error);
                return {
                    ...attachment,
                    processed: false,
                    type: type,
                    extractionStatus: 'failed',
                    error: safeError,
                    extractedText: '',
                    content: `Text extraction failed: ${safeError}`
                };
            }
        }

        if (options.allowBinaryFetch !== true && ['pdf', 'word', 'excel', 'image'].indexOf(type) !== -1) {
            return this.metadataOnlyAttachment(attachment, 'metadata-only-binary');
        }

        switch (type) {
            case 'pdf':
                return await this.processPDF(attachment);
            case 'word':
                return await this.processWord(attachment);
            case 'excel':
                return await this.processExcel(attachment);
            case 'text':
                return await this.processText(attachment);
            case 'image':
                return await this.processImage(attachment);
            case 'link':
                return await this.processLink(attachment);
            default:
                return this.processUnknown(attachment);
        }
    }

    // Detect attachment type
    detectType(attachment) {
        const mimeType = attachment.mimeType || '';
        const name = (attachment.name || '').toLowerCase();
        const url = (attachment.url || '').toLowerCase();

        // Check for web links
        if (url.startsWith('http://') || url.startsWith('https://')) {
            if (!mimeType || mimeType.includes('text/html')) {
                return 'link';
            }
        }

        // Check PDF
        if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
            return 'pdf';
        }

        // Check Word
        if (mimeType.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) {
            return 'word';
        }

        // Check Excel
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || 
            name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
            return 'excel';
        }

        // Check text
        if (mimeType.includes('text') || name.endsWith('.txt') || name.endsWith('.md')) {
            return 'text';
        }

        // Check image
        if (mimeType.includes('image') || 
            name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
            return 'image';
        }

        return 'unknown';
    }

    getExtension(nameOrUrl) {
        const value = String(nameOrUrl || '').split('?')[0].split('#')[0].toLowerCase();
        const match = value.match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    }

    clampNumber(value, fallback, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(min, Math.min(max, Math.round(number)));
    }

    normalizeExtractionLimits(options = {}) {
        return {
            maxAttachments: this.clampNumber(options.maxAttachments, 5, 1, 12),
            maxBytes: this.clampNumber(options.maxBytes, 200000, 10000, 500000),
            maxExtractedCharacters: this.clampNumber(options.maxExtractedCharacters, 3000, 500, 10000),
            timeoutMs: this.clampNumber(options.timeoutMs, 10000, 1000, 30000)
        };
    }

    // Process PDF files using PDF.js
    async processPDF(attachment) {
        try {
            return await this.processSafePdfAttachment(attachment, this.normalizeExtractionLimits({}));
        } catch (error) {
            throw new Error(`PDF processing failed: ${error.message}`);
        }
    }

    // Process Word documents
    async processWord(attachment) {
        try {
            const limits = this.normalizeExtractionLimits({});
            const response = await this.safeFetchAttachment(attachment.url, { timeoutMs: limits.timeoutMs });
            if (!response.ok) {
                throw new Error(`Failed to fetch Word document: ${response.statusText}`);
            }

            const blob = await response.blob();
            if (blob.size > limits.maxBytes) {
                throw new Error(`Attachment response is larger than the ${this.formatBytes(limits.maxBytes)} Word extraction cap`);
            }
            const arrayBuffer = await blob.arrayBuffer();
            const extracted = await this.extractTextFromOfficeDocument(arrayBuffer, {
                type: 'word',
                maxExtractedCharacters: limits.maxExtractedCharacters
            });
            return {
                ...attachment,
                processed: Boolean(extracted.text),
                type: 'word',
                extractionStatus: extracted.text
                    ? (extracted.truncated ? 'truncated' : 'text-extracted')
                    : 'failed',
                extractedText: extracted.text,
                content: extracted.text
                    ? `Word document: ${attachment.name}\n\n${extracted.text}${extracted.truncated ? '\n\n[Word document text truncated before analysis]' : ''}`
                    : `Word document: ${attachment.name}\n\nNo readable document text could be extracted within the safe limit.`,
                metadata: {
                    size: blob.size,
                    formattedSize: this.formatBytes(blob.size),
                    type: 'word',
                    truncated: extracted.truncated,
                    originalCharacters: extracted.originalCharacters,
                    extractedCharacters: extracted.text.length
                }
            };
        } catch (error) {
            throw new Error(`Word processing failed: ${error.message}`);
        }
    }

    // Process Excel spreadsheets
    async processExcel(attachment) {
        try {
            const limits = this.normalizeExtractionLimits({});
            const response = await this.safeFetchAttachment(attachment.url, { timeoutMs: limits.timeoutMs });
            if (!response.ok) {
                throw new Error(`Failed to fetch Excel file: ${response.statusText}`);
            }

            const blob = await response.blob();
            const size = this.formatBytes(blob.size);
            if (blob.size > limits.maxBytes) {
                throw new Error(`Attachment response is larger than the ${this.formatBytes(limits.maxBytes)} spreadsheet extraction cap`);
            }

            // Check if it's CSV (easier to process)
            if (attachment.name.toLowerCase().endsWith('.csv')) {
                const text = await blob.text();
                const extractedText = text.slice(0, limits.maxExtractedCharacters);
                const truncated = text.length > extractedText.length;
                const rows = extractedText.split('\n').slice(0, 10); // First 10 rows
                const preview = rows.join('\n');
                
                return {
                    ...attachment,
                    processed: true,
                    type: 'excel',
                    extractionStatus: truncated ? 'truncated' : 'text-extracted',
                    extractedText: extractedText,
                    content: `CSV Spreadsheet: ${attachment.name} (${size})\n\nPreview (first 10 rows):\n${preview}${truncated ? '\n\n[CSV content truncated before analysis]' : ''}\n\n[${text.split('\n').length} total rows]`,
                    metadata: {
                        size: blob.size,
                        formattedSize: size,
                        rows: text.split('\n').length,
                        type: 'csv',
                        truncated: truncated
                    }
                };
            }

            const arrayBuffer = await blob.arrayBuffer();
            const extracted = await this.extractTextFromOfficeDocument(arrayBuffer, {
                type: 'excel',
                maxExtractedCharacters: limits.maxExtractedCharacters
            });
            return {
                ...attachment,
                processed: Boolean(extracted.text),
                type: 'excel',
                extractionStatus: extracted.text
                    ? (extracted.truncated ? 'truncated' : 'text-extracted')
                    : 'failed',
                extractedText: extracted.text,
                content: extracted.text
                    ? `Excel Spreadsheet: ${attachment.name} (${size})\n\n${extracted.text}${extracted.truncated ? '\n\n[Spreadsheet content truncated before analysis]' : ''}`
                    : `Excel Spreadsheet: ${attachment.name} (${size})\n\nNo readable spreadsheet text could be extracted within the safe limit.`,
                metadata: {
                    size: blob.size,
                    formattedSize: size,
                    type: 'excel',
                    truncated: extracted.truncated,
                    originalCharacters: extracted.originalCharacters,
                    extractedCharacters: extracted.text.length
                }
            };
        } catch (error) {
            throw new Error(`Excel processing failed: ${error.message}`);
        }
    }

    // Process text files
    async processText(attachment) {
        try {
            const response = await this.safeFetchAttachment(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch text file: ${response.statusText}`);
            }

            const text = await response.text();
            const lines = text.split('\n');
            const preview = lines.slice(0, 20).join('\n'); // First 20 lines

            return {
                ...attachment,
                processed: true,
                type: 'text',
                extractedText: text,
                content: `Text File: ${attachment.name}\n\n${text.length > 1000 ? preview + '\n\n[Content truncated - ' + lines.length + ' total lines]' : text}`,
                metadata: {
                    size: text.length,
                    formattedSize: this.formatBytes(text.length),
                    lines: lines.length,
                    type: 'text'
                }
            };
        } catch (error) {
            throw new Error(`Text processing failed: ${error.message}`);
        }
    }

    // Process images (with optional OCR)
    async processImage(attachment) {
        try {
            const limits = this.normalizeExtractionLimits({});
            const response = await this.safeFetchAttachment(attachment.url, { timeoutMs: limits.timeoutMs });
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }

            const blob = await response.blob();
            const size = this.formatBytes(blob.size);
            if (blob.size > limits.maxBytes) {
                throw new Error(`Attachment response is larger than the ${this.formatBytes(limits.maxBytes)} OCR extraction cap`);
            }

            // Create object URL for preview
            const objectUrl = URL.createObjectURL(blob);
            const extracted = await this.extractTextFromImage(blob, {
                maxExtractedCharacters: limits.maxExtractedCharacters,
                timeoutMs: limits.timeoutMs
            });
            return {
                ...attachment,
                processed: Boolean(extracted.text),
                type: 'image',
                extractionStatus: extracted.text
                    ? (extracted.truncated ? 'truncated' : 'text-extracted')
                    : extracted.status,
                extractedText: extracted.text,
                content: extracted.text
                    ? `Image: ${attachment.name} (${size})\n\n${extracted.text}${extracted.truncated ? '\n\n[OCR text truncated before analysis]' : ''}`
                    : `Image: ${attachment.name} (${size})\n\n${extracted.detail}`,
                previewUrl: objectUrl,
                metadata: {
                    size: blob.size,
                    formattedSize: size,
                    type: blob.type,
                    dimensions: 'Unknown',
                    truncated: extracted.truncated,
                    extractedCharacters: extracted.text.length
                }
            };
        } catch (error) {
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }

    // Process web links
    async processLink(attachment) {
        try {
            const url = attachment.url;
            const parsed = this.validateAttachmentUrl(url);
            const domain = parsed.hostname;

            return {
                ...attachment,
                processed: true,
                type: 'link',
                extractedText: '',
                content: `Web Link: ${attachment.name || domain}\nURL: ${parsed.href}\n\nNote: Web links are not fetched automatically for privacy and security.`,
                metadata: {
                    domain: domain,
                    url: parsed.href
                }
            };
        } catch (error) {
            throw new Error(`Link processing failed: ${error.message}`);
        }
    }

    // Process unknown file types
    processUnknown(attachment) {
        return {
            ...attachment,
            processed: false,
            type: 'unknown',
            content: `Unsupported file type: ${attachment.name}\nMIME type: ${attachment.mimeType || 'unknown'}`,
            metadata: {
                size: attachment.bytes,
                formattedSize: this.formatBytes(attachment.bytes || 0)
            }
        };
    }

    // Extract text from HTML
    extractTextFromHTML(html) {
        if (typeof DOMParser === 'undefined') return '';
        const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
        document.querySelectorAll('script, style, template, noscript').forEach(element => element.remove());
        const output = [];
        const blockElements = new Set([
            'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer',
            'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
            'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul'
        ]);
        const visit = node => {
            if (node.nodeType === 3) {
                output.push(node.nodeValue || '');
                return;
            }
            if (node.nodeType !== 1) return;
            const localName = String(node.localName || '').toLowerCase();
            if (localName === 'br' || blockElements.has(localName)) output.push(' ');
            Array.from(node.childNodes || []).forEach(visit);
            if (blockElements.has(localName)) output.push(' ');
        };
        Array.from(document.body ? document.body.childNodes : []).forEach(visit);
        return output.join('')
            .replace(/\s+/g, ' ')
            .trim();
    }

    extractTextFromPdfBuffer(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
        if (!bytes.length) {
            return '';
        }

        let binary = '';
        const chunkSize = 8192;
        for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }

        const streams = [];
        const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
        let match;
        while ((match = streamPattern.exec(binary))) {
            streams.push(match[1]);
        }

        const fragments = [];
        const source = streams.length ? streams.join('\n') : binary;
        const literalMatches = source.match(/\((?:\\.|[^\\()]){2,}\)/g) || [];
        literalMatches.forEach((value) => {
            const decoded = this.decodePdfLiteralString(value.slice(1, -1));
            if (decoded) {
                fragments.push(decoded);
            }
        });

        const hexMatches = source.match(/<([0-9A-Fa-f\s]{8,})>/g) || [];
        hexMatches.forEach((value) => {
            const decoded = this.decodePdfHexString(value.slice(1, -1));
            if (decoded) {
                fragments.push(decoded);
            }
        });

        const normalized = fragments
            .join('\n')
            .replace(/\r\n/g, '\n')
            .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return normalized;
    }

    decodePdfLiteralString(value) {
        if (!value) return '';
        const decoded = value
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\b/g, '\b')
            .replace(/\\f/g, '\f')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
            .replace(/\\([0-7]{1,3})/g, function (_match, octal) {
                return String.fromCharCode(parseInt(octal, 8));
            });
        return decoded.replace(/\s+/g, ' ').trim();
    }

    decodePdfHexString(value) {
        const compact = String(value || '').replace(/\s+/g, '');
        if (!compact) return '';
        const padded = compact.length % 2 === 0 ? compact : compact + '0';
        let output = '';
        for (let index = 0; index < padded.length; index += 2) {
            const code = parseInt(padded.slice(index, index + 2), 16);
            if (Number.isFinite(code) && code >= 32 && code <= 126) {
                output += String.fromCharCode(code);
            } else if (code === 10 || code === 13) {
                output += '\n';
            } else {
                output += ' ';
            }
        }
        return output.replace(/\s+/g, ' ').trim();
    }

    async extractTextFromOfficeDocument(arrayBuffer, options = {}) {
        const entries = await this.extractZipEntries(arrayBuffer);
        const maxExtractedCharacters = Number(options.maxExtractedCharacters || 3000);
        let combined = '';

        if (options.type === 'word') {
            const xml = entries['word/document.xml'] || '';
            combined = this.extractWordXmlText(xml);
        } else {
            combined = this.extractExcelText(entries);
        }

        const text = combined.slice(0, maxExtractedCharacters);
        return {
            text,
            truncated: combined.length > text.length,
            originalCharacters: combined.length
        };
    }

    async extractZipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
        const entries = {};
        let index = 0;

        while (index + 30 < bytes.length) {
            const signature = this.readUint32LE(bytes, index);
            if (signature !== 0x04034b50) {
                index += 1;
                continue;
            }

            const compressionMethod = this.readUint16LE(bytes, index + 8);
            const compressedSize = this.readUint32LE(bytes, index + 18);
            const fileNameLength = this.readUint16LE(bytes, index + 26);
            const extraLength = this.readUint16LE(bytes, index + 28);
            const nameStart = index + 30;
            const nameEnd = nameStart + fileNameLength;
            const dataStart = nameEnd + extraLength;
            const dataEnd = dataStart + compressedSize;
            const name = this.decodeUtf8(bytes.subarray(nameStart, nameEnd));
            const data = bytes.subarray(dataStart, dataEnd);

            entries[name] = await this.inflateZipEntry(data, compressionMethod);
            index = dataEnd;
        }

        return entries;
    }

    async inflateZipEntry(bytes, compressionMethod) {
        if (compressionMethod === 0) {
            return this.decodeUtf8(bytes);
        }
        if (compressionMethod !== 8) {
            return '';
        }

        if (nodeZlib && typeof Buffer !== 'undefined') {
            return nodeZlib.inflateRawSync(Buffer.from(bytes)).toString('utf8');
        }

        if (typeof DecompressionStream !== 'undefined') {
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            const response = new Response(stream);
            return response.text();
        }

        return '';
    }

    extractWordXmlText(xml) {
        if (typeof DOMParser === 'undefined') return '';
        const document = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
        if (document.getElementsByTagName('parsererror').length) return '';

        const output = [];
        const visit = node => {
            if (node.nodeType === 3) {
                if (node.parentNode && String(node.parentNode.localName || '').toLowerCase() === 't') {
                    output.push(node.nodeValue || '');
                }
                return;
            }
            if (node.nodeType !== 1 && node.nodeType !== 9) return;
            const localName = String(node.localName || '').toLowerCase();
            if (localName === 'tab') output.push('\t');
            if (localName === 'br' || localName === 'cr') output.push('\n');
            Array.from(node.childNodes || []).forEach(visit);
            if (localName === 'p') output.push('\n');
        };
        visit(document);
        return output.join('')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    extractExcelText(entries) {
        const sharedStrings = this.extractSharedStrings(entries['xl/sharedStrings.xml'] || '');
        const worksheetNames = Object.keys(entries).filter((key) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(key)).sort();
        const sections = worksheetNames.map((name, index) => {
            const label = `Sheet ${index + 1}`;
            const rows = this.extractWorksheetRows(entries[name], sharedStrings);
            return `${label}\n${rows.join('\n')}`.trim();
        }).filter(Boolean);
        return sections.join('\n\n').trim();
    }

    extractSharedStrings(xml) {
        const values = [];
        String(xml || '').replace(/<si[\s\S]*?<\/si>/g, (item) => {
            const text = item.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            values.push(text);
            return item;
        });
        return values;
    }

    extractWorksheetRows(xml, sharedStrings) {
        const rows = [];
        const rowMatches = String(xml || '').match(/<row[\s\S]*?<\/row>/g) || [];
        rowMatches.forEach((rowMatch) => {
            const cells = [];
            const cellMatches = rowMatch.match(/<c[\s\S]*?<\/c>/g) || [];
            cellMatches.forEach((cellMatch) => {
                const typeMatch = cellMatch.match(/\bt="([^"]+)"/);
                const valueMatch = cellMatch.match(/<v>([\s\S]*?)<\/v>/);
                const inlineMatch = cellMatch.match(/<t[^>]*>([\s\S]*?)<\/t>/);
                const type = typeMatch ? typeMatch[1] : '';
                let value = inlineMatch ? inlineMatch[1] : (valueMatch ? valueMatch[1] : '');
                if (type === 's') {
                    value = sharedStrings[Number(value)] || '';
                }
                value = String(value || '').replace(/\s+/g, ' ').trim();
                if (value) cells.push(value);
            });
            if (cells.length) rows.push(cells.join('\t'));
        });
        return rows.slice(0, 100);
    }

    async extractTextFromImage(blob, options = {}) {
        const maxExtractedCharacters = Number(options.maxExtractedCharacters || 3000);
        if (typeof Tesseract !== 'undefined' && Tesseract && typeof Tesseract.recognize === 'function') {
            const result = await Tesseract.recognize(blob, 'eng');
            const text = String(result && result.data && result.data.text || '').trim().slice(0, maxExtractedCharacters);
            return {
                status: text ? 'text-extracted' : 'failed',
                text,
                truncated: text.length >= maxExtractedCharacters,
                detail: text ? 'OCR completed.' : 'OCR ran but no readable text was found.'
            };
        }

        return {
            status: 'unsupported',
            text: '',
            truncated: false,
            detail: 'OCR is not available in this runtime. The image was kept out of AI handoff instead of pretending text was extracted.'
        };
    }

    readUint16LE(bytes, index) {
        return bytes[index] | (bytes[index + 1] << 8);
    }

    readUint32LE(bytes, index) {
        return (bytes[index]) |
            (bytes[index + 1] << 8) |
            (bytes[index + 2] << 16) |
            (bytes[index + 3] << 24);
    }

    decodeUtf8(bytes) {
        if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder('utf-8').decode(bytes);
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('utf8');
        }
        return '';
    }

    // Fetch attachment content only after basic URL safety checks.
    async safeFetchAttachment(url, options = {}) {
        const parsed = this.validateAttachmentUrl(url);
        const fetchOptions = { ...options };
        const timeoutMs = fetchOptions.timeoutMs;
        delete fetchOptions.timeoutMs;

        if (timeoutMs && typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                return await fetch(parsed.href, {
                    ...fetchOptions,
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    redirect: 'error',
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }
        }

        return fetch(parsed.href, {
            ...fetchOptions,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error'
        });
    }

    validateAttachmentUrl(url) {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        if (parsed.protocol !== 'https:') {
            throw new Error('Only HTTPS attachment URLs can be fetched');
        }

        if (this.isPrivateOrLocalHostname(hostname)) {
            throw new Error('Private or local attachment URLs are not fetched');
        }

        return parsed;
    }

    isPrivateOrLocalHostname(hostname) {
        const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
        if (
            value === 'localhost' ||
            value.endsWith('.localhost') ||
            value.endsWith('.local') ||
            value === '::1' ||
            value === '0:0:0:0:0:0:0:1' ||
            value.indexOf('fc') === 0 ||
            value.indexOf('fd') === 0 ||
            value.indexOf('fe80:') === 0
        ) {
            return true;
        }

        const parts = value.split('.').map((part) => Number(part));
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return false;
        }

        const first = parts[0];
        const second = parts[1];
        return first === 0 ||
            first === 10 ||
            first === 127 ||
            (first === 100 && second >= 64 && second <= 127) ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) ||
            first >= 224;
    }

    // Format bytes to human-readable size
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Generate summary of all attachments for AI analysis
    generateAttachmentsSummary(processedAttachments) {
        if (!processedAttachments || processedAttachments.length === 0) {
            return 'No attachments';
        }

        let summary = `\n\n=== ATTACHMENTS (${processedAttachments.length}) ===\n\n`;

        for (const attachment of processedAttachments) {
            summary += `📎 ${attachment.name} (${attachment.type})\n`;
            
            if (attachment.extractedText && attachment.extractedText.length > 0) {
                // Include extracted text (truncated if too long)
                const text = attachment.extractedText.substring(0, 500);
                summary += `Content: ${text}${attachment.extractedText.length > 500 ? '...' : ''}\n\n`;
            } else if (attachment.content) {
                summary += `${attachment.content}\n\n`;
            }
        }

        return summary;
    }

    // Check if attachment processing is supported in current environment
    checkEnvironmentSupport() {
        return {
            fetch: typeof fetch !== 'undefined',
            blob: typeof Blob !== 'undefined',
            url: typeof URL !== 'undefined',
            pdfjs: typeof pdfjsLib !== 'undefined',
            mammoth: typeof mammoth !== 'undefined',
            xlsx: typeof XLSX !== 'undefined',
            tesseract: typeof Tesseract !== 'undefined'
        };
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttachmentProcessor;
}

if (typeof window !== 'undefined') {
    window.AttachmentProcessor = AttachmentProcessor;
}
