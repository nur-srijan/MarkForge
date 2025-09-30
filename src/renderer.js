const { ipcRenderer } = require('electron');
const marked = require('marked');
const hljs = require('highlight.js');
const Split = require('split.js');
const puppeteer = require('puppeteer');
const katex = require('katex');
const path = require('path');
const fs = require('fs');

// DOM Elements
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const newBtn = document.getElementById('newBtn');
const openBtn = document.getElementById('openBtn');
const saveBtn = document.getElementById('saveBtn');
const saveAsBtn = document.getElementById('saveAsBtn');
const exportHtmlBtn = document.getElementById('exportHtmlBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const currentFileElement = document.getElementById('currentFile');
const wordCountElement = document.getElementById('wordCount');

// State variables
let currentFilePath = null;
let isDocumentModified = false;

// HTML Sanitization function to prevent XSS
function sanitizeHtml(html) {
  // Remove all script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers from all elements
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*on\w+\s*=\s*[^>\s]*/gi, '');
  
  // Remove javascript: URLs
  html = html.replace(/javascript:/gi, '');
  
  // Remove data: URLs that could contain scripts
  html = html.replace(/data:text\/html/gi, '');
  html = html.replace(/data:application\/javascript/gi, '');
  
  // Remove iframe tags
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // Remove object and embed tags
  html = html.replace(/<(object|embed)\b[^<]*(?:(?!<\/(object|embed)>)<[^<]*)*<\/(object|embed)>/gi, '');
  
  // Remove base tags
  html = html.replace(/<base\b[^>]*>/gi, '');
  
  // Remove meta refresh tags
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi, '');
  
  // Remove link tags with javascript
  html = html.replace(/<link[^>]*href\s*=\s*["']javascript:[^>]*>/gi, '');
  
  // Remove style tags that could contain malicious CSS
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove any remaining potentially dangerous attributes
  html = html.replace(/\s*(href|src)\s*=\s*["']javascript:/gi, '');
  html = html.replace(/\s*(href|src)\s*=\s*["']data:text\/html/gi, '');
  
  return html;
}

// Custom renderer for marked with KaTeX support and security
const renderer = new marked.Renderer();

// Override code rendering to handle LaTeX
renderer.code = function(code, language) {
  if (language === 'math' || language === 'latex') {
    try {
      return katex.renderToString(code, {
        displayMode: true,
        throwOnError: false,
        errorColor: '#ff6b6b'
      });
    } catch (error) {
      return `<div class="katex-error">LaTeX Error: ${error.message}</div>`;
    }
  }
  
  const languageClass = language ? `language-${language}` : '';
  const highlighted = hljs.getLanguage(language) ? 
    hljs.highlight(code, { language }).value : 
    hljs.highlightAuto(code).value;
  
  return `<pre><code class="hljs ${languageClass}">${highlighted}</code></pre>`;
};

// Override inline code rendering to handle inline LaTeX
renderer.codespan = function(code) {
  // Check if it's inline LaTeX (wrapped in $)
  if (code.startsWith('$') && code.endsWith('$') && code.length > 2) {
    const latexCode = code.slice(1, -1);
    try {
      return katex.renderToString(latexCode, {
        displayMode: false,
        throwOnError: false,
        errorColor: '#ff6b6b'
      });
    } catch (error) {
      return `<span class="katex-error">LaTeX Error: ${error.message}</span>`;
    }
  }
  
  return `<code>${code}</code>`;
};

// Configure marked with custom renderer and highlight.js
marked.setOptions({
  renderer: renderer,
  highlight: function(code, lang) {
    if (lang === 'math' || lang === 'latex') {
      return code; // Don't highlight LaTeX, let KaTeX handle it
    }
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
  pedantic: false,
  gfm: true,
  breaks: false,
  sanitize: true, // Enable sanitization
  smartypants: false,
  xhtml: false
});

// Function to process LaTeX in text before markdown parsing
function processLatex(text) {
  // Process display math blocks ($$...$$)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, function(match, latex) {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
        errorColor: '#ff6b6b'
      });
    } catch (error) {
      return `<div class="katex-error">LaTeX Error: ${error.message}</div>`;
    }
  });
  
  // Process inline math ($...$)
  text = text.replace(/\$([^\$\n]+?)\$/g, function(match, latex) {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: false,
        throwOnError: false,
        errorColor: '#ff6b6b'
      });
    } catch (error) {
      return `<span class="katex-error">LaTeX Error: ${error.message}</span>`;
    }
  });
  
  return text;
}

// Initialize Split.js for resizable panels
Split(['#editor-container', '#preview-container'], {
  sizes: [50, 50],
  minSize: 100,
  gutterSize: 6,
  cursor: 'col-resize'
});

// Update preview with rendered markdown and LaTeX
function updatePreview() {
  const markdownText = editor.value;
  
  // First process LaTeX, then parse markdown
  const processedText = processLatex(markdownText);
  const renderedHtml = marked.parse(processedText);
  
  // Sanitize HTML before rendering to prevent XSS
  const sanitizedHtml = sanitizeHtml(renderedHtml);
  preview.innerHTML = sanitizedHtml;
  
  // Update word count
  const wordCount = markdownText.trim() ? markdownText.trim().split(/\s+/).length : 0;
  wordCountElement.textContent = `${wordCount} words`;
  
  // Mark document as modified
  if (!isDocumentModified) {
    isDocumentModified = true;
    updateTitle();
  }
}

// Update window title to show current file and modification status
function updateTitle() {
  const fileName = currentFilePath ? path.basename(currentFilePath) : 'Untitled';
  const modifiedIndicator = isDocumentModified ? '*' : '';
  currentFileElement.textContent = `${fileName}${modifiedIndicator}`;
}

// Create a new document
function newDocument() {
  if (isDocumentModified) {
    // In a real app, you might want to prompt the user to save changes
    // For simplicity, we'll just create a new document
  }
  
  editor.value = '';
  currentFilePath = null;
  isDocumentModified = false;
  updatePreview();
  updateTitle();
}

// Open a file
function openFile() {
  // The actual file opening is handled by the main process
  // This function is called by the IPC when a file is opened
}

// Save the current file
async function saveFile() {
  if (!currentFilePath) {
    return saveFileAs();
  }
  
  try {
    const result = await ipcRenderer.invoke('save-file', {
      filePath: currentFilePath,
      content: editor.value
    });
    
    if (result.success) {
      isDocumentModified = false;
      updateTitle();
    }
  } catch (error) {
    console.error('Error saving file:', error);
  }
}

// Save the file with a new name
async function saveFileAs() {
  try {
    const result = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Save Markdown File',
      defaultPath: currentFilePath || 'untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePath) {
      currentFilePath = result.filePath;
      await saveFile();
    }
  } catch (error) {
    console.error('Error in save as:', error);
  }
}

// Export to HTML with security measures
async function exportToHtml() {
  try {
    // Generate HTML content with styles
    const markdownText = editor.value;
    const processedText = processLatex(markdownText);
    const renderedHtml = marked.parse(processedText);
    
    // Sanitize the rendered HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(renderedHtml);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net;">
        <title>${currentFilePath ? path.basename(currentFilePath, path.extname(currentFilePath)) : 'Untitled'}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #24292e;
            background-color: #fff;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          /* GitHub Markdown styles for light theme */
          h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #24292e;
          }
          
          h1 {
            padding-bottom: 0.3em;
            font-size: 2em;
            border-bottom: 1px solid #eaecef;
          }
          
          h2 {
            padding-bottom: 0.3em;
            font-size: 1.5em;
            border-bottom: 1px solid #eaecef;
          }
          
          h3 {
            font-size: 1.25em;
          }
          
          h4 {
            font-size: 1em;
          }
          
          h5 {
            font-size: 0.875em;
          }
          
          h6 {
            font-size: 0.85em;
            color: #6a737d;
          }
          
          p, blockquote, ul, ol, dl, table, pre {
            margin-top: 0;
            margin-bottom: 16px;
          }
          
          code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: rgba(27, 31, 35, 0.05);
            border-radius: 3px;
            font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
            color: #24292e;
          }
          
          pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f6f8fa;
            border-radius: 3px;
            border: 1px solid #e1e4e8;
          }
          
          pre code {
            padding: 0;
            margin: 0;
            font-size: 100%;
            word-break: normal;
            white-space: pre;
            background: transparent;
            border: 0;
            color: #24292e;
          }
          
          blockquote {
            padding: 0 1em;
            color: #6a737d;
            border-left: 0.25em solid #dfe2e5;
            background-color: #f6f8fa;
            margin: 0 0 16px 0;
          }
          
          table {
            border-spacing: 0;
            border-collapse: collapse;
            display: block;
            width: 100%;
            overflow: auto;
            margin: 16px 0;
          }
          
          table th {
            font-weight: 600;
            background-color: #f6f8fa;
            color: #24292e;
          }
          
          table th, table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
          }
          
          table tr {
            background-color: #fff;
            border-top: 1px solid #c6cbd1;
          }
          
          table tr:nth-child(2n) {
            background-color: #f6f8fa;
          }
          
          img {
            max-width: 100%;
            box-sizing: content-box;
            background-color: #fff;
          }
          
          hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
          }
          
          ul, ol {
            padding-left: 2em;
          }
          
          li {
            margin-bottom: 0.25em;
          }
          
          a {
            color: #0366d6;
            text-decoration: none;
          }
          
          a:hover {
            text-decoration: underline;
          }
          
          /* KaTeX styling for light theme */
          .katex {
            font-size: 1.1em;
            color: #24292e;
          }
          
          .katex-display {
            margin: 1.5em 0;
            text-align: center;
            background: #f6f8fa;
            border-radius: 6px;
            padding: 16px;
            border: 1px solid #e1e4e8;
          }
          
          .katex:not(.katex-display) {
            background: #f6f8fa;
            border-radius: 3px;
            padding: 2px 6px;
            border: 1px solid #e1e4e8;
          }
          
          .katex-error {
            color: #d73a49;
            background: #ffeef0;
            border: 1px solid #f97583;
            border-radius: 3px;
            padding: 8px 12px;
            font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        ${sanitizedHtml}
      </body>
      </html>
    `;
    
    const result = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Export to HTML',
      defaultPath: currentFilePath ? 
        path.join(path.dirname(currentFilePath), path.basename(currentFilePath, path.extname(currentFilePath)) + '.html') : 
        'untitled.html',
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePath) {
      await ipcRenderer.invoke('save-html', {
        filePath: result.filePath,
        content: htmlContent
      });
    }
  } catch (error) {
    console.error('Error exporting to HTML:', error);
  }
}

// Export to PDF with security measures
async function exportToPdf() {
  try {
    // Generate HTML content with styles
    const markdownText = editor.value;
    const processedText = processLatex(markdownText);
    const renderedHtml = marked.parse(processedText);
    
    // Sanitize the rendered HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(renderedHtml);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net;">
        <title>${currentFilePath ? path.basename(currentFilePath, path.extname(currentFilePath)) : 'Untitled'}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #24292e;
            background-color: #fff;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          /* GitHub Markdown styles for light theme */
          h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #24292e;
          }
          
          h1 {
            padding-bottom: 0.3em;
            font-size: 2em;
            border-bottom: 1px solid #eaecef;
          }
          
          h2 {
            padding-bottom: 0.3em;
            font-size: 1.5em;
            border-bottom: 1px solid #eaecef;
          }
          
          h3 {
            font-size: 1.25em;
          }
          
          h4 {
            font-size: 1em;
          }
          
          h5 {
            font-size: 0.875em;
          }
          
          h6 {
            font-size: 0.85em;
            color: #6a737d;
          }
          
          p, blockquote, ul, ol, dl, table, pre {
            margin-top: 0;
            margin-bottom: 16px;
          }
          
          code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: rgba(27, 31, 35, 0.05);
            border-radius: 3px;
            font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
            color: #24292e;
          }
          
          pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f6f8fa;
            border-radius: 3px;
            border: 1px solid #e1e4e8;
          }
          
          pre code {
            padding: 0;
            margin: 0;
            font-size: 100%;
            word-break: normal;
            white-space: pre;
            background: transparent;
            border: 0;
            color: #24292e;
          }
          
          blockquote {
            padding: 0 1em;
            color: #6a737d;
            border-left: 0.25em solid #dfe2e5;
            background-color: #f6f8fa;
            margin: 0 0 16px 0;
          }
          
          table {
            border-spacing: 0;
            border-collapse: collapse;
            display: block;
            width: 100%;
            overflow: auto;
            margin: 16px 0;
          }
          
          table th {
            font-weight: 600;
            background-color: #f6f8fa;
            color: #24292e;
          }
          
          table th, table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
          }
          
          table tr {
            background-color: #fff;
            border-top: 1px solid #c6cbd1;
          }
          
          table tr:nth-child(2n) {
            background-color: #f6f8fa;
          }
          
          img {
            max-width: 100%;
            box-sizing: content-box;
            background-color: #fff;
          }
          
          hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
          }
          
          ul, ol {
            padding-left: 2em;
          }
          
          li {
            margin-bottom: 0.25em;
          }
          
          a {
            color: #0366d6;
            text-decoration: none;
          }
          
          a:hover {
            text-decoration: underline;
          }
          
          /* KaTeX styling for light theme */
          .katex {
            font-size: 1.1em;
            color: #24292e;
          }
          
          .katex-display {
            margin: 1.5em 0;
            text-align: center;
            background: #f6f8fa;
            border-radius: 6px;
            padding: 16px;
            border: 1px solid #e1e4e8;
          }
          
          .katex:not(.katex-display) {
            background: #f6f8fa;
            border-radius: 3px;
            padding: 2px 6px;
            border: 1px solid #e1e4e8;
          }
          
          .katex-error {
            color: #d73a49;
            background: #ffeef0;
            border: 1px solid #f97583;
            border-radius: 3px;
            padding: 8px 12px;
            font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        ${sanitizedHtml}
      </body>
      </html>
    `;
    
    const result = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Export to PDF',
      defaultPath: currentFilePath ? 
        path.join(path.dirname(currentFilePath), path.basename(currentFilePath, path.extname(currentFilePath)) + '.pdf') : 
        'untitled.pdf',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePath) {
      // Create a temporary HTML file
      const tempHtmlPath = path.join(require('os').tmpdir(), 'markforge-temp.html');
      fs.writeFileSync(tempHtmlPath, htmlContent);
      
      // Convert HTML to PDF using Puppeteer
      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
      });
      await browser.close();
      fs.writeFileSync(result.filePath, pdfBuffer);
      
      // Clean up temp file
      fs.unlinkSync(tempHtmlPath);
    }
  } catch (error) {
    console.error('Error exporting to PDF:', error);
  }
}

// Event listeners
editor.addEventListener('input', updatePreview);
newBtn.addEventListener('click', newDocument);
openBtn.addEventListener('click', () => {
  // The actual file dialog is shown by the main process
});
saveBtn.addEventListener('click', saveFile);
saveAsBtn.addEventListener('click', saveFileAs);
exportHtmlBtn.addEventListener('click', exportToHtml);
exportPdfBtn.addEventListener('click', exportToPdf);

// IPC event listeners
ipcRenderer.on('file-new', newDocument);
ipcRenderer.on('file-opened', (event, { path, content }) => {
  currentFilePath = path;
  editor.value = content;
  isDocumentModified = false;
  updatePreview();
  updateTitle();
});
ipcRenderer.on('file-save', saveFile);
ipcRenderer.on('file-save-as', saveFileAs);
ipcRenderer.on('export-html', exportToHtml);
ipcRenderer.on('export-pdf', exportToPdf);

// Initialize the preview on load
updatePreview();

// Set some sample markdown content for first-time users
if (!editor.value) {
  editor.value = `# ✨ Welcome to MarkForge

A premium Markdown editor with real-time preview, LaTeX support, and export capabilities.

## 🚀 Features

- **Real-time preview** with GitHub-style rendering
- **LaTeX support** with KaTeX rendering
- **Export to HTML and PDF** with professional styling
- **Premium dark theme** with modern UI
- **Syntax highlighting** for code blocks
- **Split-pane interface** with resizable panels

## 💎 Premium Experience

This editor provides a seamless writing experience with:

- Beautiful dark theme optimized for long writing sessions
- Smooth animations and transitions
- Professional typography and spacing
- Intuitive keyboard shortcuts
- Full LaTeX support for mathematical expressions

## 🔧 Example Code

\`\`\`javascript
// Premium JavaScript example
class MarkForgeEditor {
  constructor() {
    this.theme = 'premium-dark';
    this.features = ['realtime-preview', 'export', 'syntax-highlighting', 'latex'];
  }
  
  async exportToPDF() {
    console.log('Exporting with premium styling...');
    return await this.generatePDF();
  }
}
\`\`\`

## 📐 LaTeX Support

### Inline Math
You can write inline math expressions like $E = mc^2$ or $\\frac{a}{b}$ directly in your text.

### Display Math
For larger equations, use display math blocks:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

### Complex Equations
You can write complex mathematical expressions:

$$
\\begin{align}
\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\epsilon_0} \\\\
\\nabla \\cdot \\vec{B} &= 0 \\\\
\\nabla \\times \\vec{E} &= -\\frac{\\partial \\vec{B}}{\\partial t} \\\\
\\nabla \\times \\vec{B} &= \\mu_0\\vec{J} + \\mu_0\\epsilon_0\\frac{\\partial \\vec{E}}{\\partial t}
\\end{align}
$$

## 📋 Lists & Organization

### Unordered Lists
- Feature 1: Real-time preview
- Feature 2: Export capabilities
  - HTML export
  - PDF export
- Feature 3: Premium UI
- Feature 4: LaTeX support

### Ordered Lists
1. **Install** MarkForge
2. **Open** your markdown files
3. **Write** with real-time preview
4. **Add** LaTeX equations
5. **Export** to your preferred format

## 📊 Tables

| Feature | Status | Description |
|---------|--------|-------------|
| Dark Theme | ✅ | Premium dark interface |
| Real-time Preview | ✅ | Live markdown rendering |
| Export Options | ✅ | HTML & PDF support |
| Syntax Highlighting | ✅ | Code block styling |
| LaTeX Support | ✅ | Mathematical expressions |

## 🎨 Styling Examples

> **Pro Tip**: This editor uses a premium dark theme that's easy on the eyes and perfect for long writing sessions. You can now write beautiful mathematical expressions with LaTeX support!

---

### Ready to create amazing content? Start typing above! 🎉
`;
  updatePreview();
} 