# MarkForge

A lightweight Electron-based Markdown editor with real-time preview and export capabilities.

## Features

- Real-time Markdown preview with GitHub-style rendering
- Split-pane interface with adjustable panels
- Export to HTML and PDF formats
- Syntax highlighting for code blocks
- Word count tracking
- File operations (New, Open, Save, Save As)
- Cross-platform support (Windows, macOS, Linux)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/markforge.git
   cd markforge
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the application:
   ```
   npm start
   ```

## Building Distributable

To build the application for your platform:

```
npm run build
```

This will create distributable packages in the `dist` directory.

## Technologies Used

- Electron
- Marked (for Markdown parsing)
- highlight.js (for syntax highlighting)
- Split.js (for resizable panels)
- Puppeteer (for secure PDF export)
- KaTeX (for LaTeX rendering)

## Security Features

- **HTML Sanitization**: All HTML content is sanitized to prevent XSS attacks
- **Content Security Policy**: CSP headers are included in exports to prevent script injection
- **Secure Dependencies**: Uses secure, up-to-date libraries with no known vulnerabilities
- **Input Validation**: All user input is properly validated and sanitized
- **Script Tag Removal**: All `<script>` tags and event handlers are stripped from exports
- **Safe PDF Generation**: Uses Puppeteer for secure PDF generation instead of vulnerable libraries

## License

MIT

## Future Enhancements

- Custom themes
- Spell checking
- Auto-save functionality
- Table of contents generation
- Image insertion and management
- Markdown shortcuts toolbar 
