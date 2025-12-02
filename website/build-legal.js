#!/usr/bin/env node
/**
 * Build script to convert legal.md to legal.html
 * Run with: node website/build-legal.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configure marked for GitHub-flavored markdown
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Read markdown
const mdPath = join(__dirname, 'legal.md');
const mdContent = readFileSync(mdPath, 'utf-8');

// Convert to HTML
const contentHtml = marked.parse(mdContent);

// Full HTML template
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="BubbleList Privacy Policy and Terms of Service">
    <title>Legal - BubbleList</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }

        /* Prose styling for markdown content */
        .prose h1 { font-size: 2.25rem; font-weight: 700; color: #111827; margin-bottom: 1rem; }
        .prose h2 { font-size: 1.5rem; font-weight: 700; color: #111827; margin-top: 2.5rem; margin-bottom: 1rem; }
        .prose h3 { font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 1.5rem; margin-bottom: 0.75rem; }
        .prose h4 { font-size: 1.125rem; font-weight: 600; color: #111827; margin-top: 1rem; margin-bottom: 0.5rem; }
        .prose p { color: #374151; margin-bottom: 1rem; line-height: 1.7; }
        .prose ul { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; color: #374151; }
        .prose li { margin-bottom: 0.25rem; }
        .prose a { color: #059669; text-decoration: underline; }
        .prose a:hover { color: #047857; }
        .prose hr { border-color: #d1d5db; margin: 2rem 0; }
        .prose blockquote { background: #ecfdf5; border-left: 4px solid #059669; padding: 1rem; margin: 1rem 0; color: #065f46; }
        .prose strong { font-weight: 600; }
        .prose em { font-style: italic; }
    </style>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16 items-center">
                <div class="flex items-center">
                    <a href="index.html" class="flex items-center">
                        <img src="bubblelist.svg" alt="BubbleList" class="w-8 h-8">
                        <span class="ml-2 text-xl font-bold text-gray-900">BubbleList</span>
                    </a>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="index.html" class="text-gray-600 hover:text-gray-900">Home</a>
                    <a href="https://bubblelist-app.rkroll.com" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">Try Free</a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Content -->
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8 md:p-12 prose">
            ${contentHtml}
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-gray-900 text-gray-400 py-8 mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div class="mb-4">
                <a href="index.html" class="text-gray-400 hover:text-white mx-3">Home</a>
                <a href="legal.html" class="text-gray-400 hover:text-white mx-3">Legal</a>
            </div>
            <p class="text-sm">&copy; 2025 BubbleList. Checklists you can use again and again.</p>
        </div>
    </footer>
</body>
</html>
`;

// Write HTML
const htmlPath = join(__dirname, 'legal.html');
writeFileSync(htmlPath, fullHtml);

console.log('Generated legal.html from legal.md');
