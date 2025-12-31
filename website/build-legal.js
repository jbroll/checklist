#!/usr/bin/env node
/**
 * Build script to convert markdown files to HTML pages
 * Run with: node website/build-legal.js
 *
 * Supports brand variables in markdown:
 *   {{brand.name}} - Brand display name (kjekit or CheckList)
 *   {{brand.supportEmail}} - Support email address
 *   {{brand.salesEmail}} - Sales email address
 *   {{brand.tagline}} - Brand tagline
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

// Brand configurations (must match src/lib/brand.ts)
const brands = {
  kjekit: {
    name: 'kjekit',
    tagline: 'Nicely Shared Checklists',
    supportEmail: 'support@kjekit.com',
    salesEmail: 'sales@kjekit.com',
    logo: 'kjekit-path.svg',
    aboutIntro: 'kjekit (pronounced "check it") is a checklist app designed for lists you use every day.',
    appUrl: 'https://app.kjekit.com',
  },
  checklist: {
    name: 'CheckList',
    tagline: 'Shared Checklists',
    supportEmail: 'support@checklist.rkroll.com',
    salesEmail: 'sales@checklist.rkroll.com',
    logo: 'checklist-icon.svg',
    aboutIntro: 'CheckList is a checklist app designed for lists you use every day.',
    appUrl: 'https://checklist.rkroll.com',
  },
};

// Runtime brand detection script (injected into pages)
const brandScript = `
<script>
(function() {
  var hostname = window.location.hostname;
  var isKjekit = hostname.includes('kjekit');
  var brand = isKjekit ? ${JSON.stringify(brands.kjekit)} : ${JSON.stringify(brands.checklist)};

  // Replace all brand placeholders
  document.querySelectorAll('[data-brand]').forEach(function(el) {
    var key = el.getAttribute('data-brand');
    // Special cases for composite brand values
    if (key === 'appUrlHref') {
      el.href = brand.appUrl;
    } else if (key === 'nameLink') {
      el.href = brand.appUrl;
      el.textContent = brand.name;
    } else if (brand[key]) {
      if (el.tagName === 'A' && key.includes('Email')) {
        el.href = 'mailto:' + brand[key];
        el.textContent = brand[key];
      } else if (el.tagName === 'A' && key === 'appUrl') {
        el.href = brand[key];
        el.textContent = brand[key];
      } else if (el.tagName === 'IMG') {
        el.src = brand[key];
        el.alt = brand.name;
      } else if (el.tagName === 'LINK') {
        el.href = brand[key];
      } else {
        el.textContent = brand[key];
      }
    }
  });

  // Update title
  var title = document.querySelector('title');
  if (title) {
    title.textContent = title.textContent.replace(/kjekit|CheckList/g, brand.name);
  }
})();
</script>
`;

// Common styles - using system font stack similar to Inter
const styles = `
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }

        /* Prose styling for markdown content */
        .prose h1 { font-size: 2.25rem; font-weight: 700; color: #111827; margin-bottom: 1rem; }
        .prose h2 { font-size: 1.5rem; font-weight: 700; color: #111827; margin-top: 2.5rem; margin-bottom: 1rem; }
        .prose h3 { font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 1.5rem; margin-bottom: 0.75rem; }
        .prose h4 { font-size: 1.125rem; font-weight: 600; color: #111827; margin-top: 1rem; margin-bottom: 0.5rem; }
        .prose p { color: #374151; margin-bottom: 1rem; line-height: 1.7; }
        .prose ul { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; color: #374151; }
        .prose li { margin-bottom: 0.25rem; }
        .prose a { color: #0d9488; text-decoration: underline; }
        .prose a:hover { color: #0f766e; }
        .prose hr { border-color: #d1d5db; margin: 2rem 0; }
        .prose blockquote { background: #f0fdfa; border-left: 4px solid #14b8a6; padding: 1rem; margin: 1rem 0; color: #115e59; }
        .prose strong { font-weight: 600; }
        .prose em { font-style: italic; }
`;

// Generate navigation links (exclude current page)
function generateNavLinks(currentPage) {
  const links = [];
  if (currentPage !== 'index.html') {
    links.push('<a href="index.html" class="text-lg text-gray-600 hover:text-gray-900">Home</a>');
  }
  if (currentPage !== 'about.html') {
    links.push('<a href="about.html" class="text-lg text-gray-600 hover:text-gray-900">About</a>');
  }
  return links.join('\n                    ');
}

// Generate footer links (exclude current page)
function generateFooterLinks(currentPage) {
  const links = [];
  if (currentPage !== 'index.html') {
    links.push('<a href="index.html" class="text-lg text-gray-400 hover:text-white mx-3">Home</a>');
  }
  if (currentPage !== 'about.html') {
    links.push('<a href="about.html" class="text-lg text-gray-400 hover:text-white mx-3">About</a>');
  }
  if (currentPage !== 'privacy.html') {
    links.push('<a href="privacy.html" class="text-lg text-gray-400 hover:text-white mx-3">Privacy</a>');
  }
  if (currentPage !== 'terms.html') {
    links.push('<a href="terms.html" class="text-lg text-gray-400 hover:text-white mx-3">Terms</a>');
  }
  return links.join('\n                ');
}

// Process markdown content to convert {{brand.X}} to data-brand elements
function processBrandVariables(html) {
  // Replace {{brand.name}} with span (default to CheckList)
  html = html.replace(/\{\{brand\.name\}\}/g, '<span data-brand="name">CheckList</span>');
  // Replace {{brand.tagline}} with span
  html = html.replace(/\{\{brand\.tagline\}\}/g, '<span data-brand="tagline">Shared Checklists</span>');
  // Replace {{brand.aboutIntro}} with span
  html = html.replace(/\{\{brand\.aboutIntro\}\}/g, `<span data-brand="aboutIntro">${brands.checklist.aboutIntro}</span>`);
  // Replace {{brand.supportEmail}} with link
  html = html.replace(/\{\{brand\.supportEmail\}\}/g, `<a href="mailto:${brands.checklist.supportEmail}" data-brand="supportEmail">${brands.checklist.supportEmail}</a>`);
  // Replace {{brand.salesEmail}} with link
  html = html.replace(/\{\{brand\.salesEmail\}\}/g, `<a href="mailto:${brands.checklist.salesEmail}" data-brand="salesEmail">${brands.checklist.salesEmail}</a>`);
  // Replace {{brand.appUrl}} with link (standalone)
  html = html.replace(/\{\{brand\.appUrl\}\}/g, `<a href="${brands.checklist.appUrl}" data-brand="appUrl">${brands.checklist.appUrl}</a>`);
  // Replace {{brand.nameLink}} with linked brand name
  html = html.replace(/\{\{brand\.nameLink\}\}/g, `<a href="${brands.checklist.appUrl}" data-brand="nameLink">${brands.checklist.name}</a>`);
  return html;
}

// Generate HTML page from markdown
function generatePage(mdFile, htmlFile, title) {
  const mdPath = join(__dirname, mdFile);
  const mdContent = readFileSync(mdPath, 'utf-8');
  let contentHtml = marked.parse(mdContent);
  contentHtml = processBrandVariables(contentHtml);

  const navLinks = generateNavLinks(htmlFile);
  const footerLinks = generateFooterLinks(htmlFile);

  const fullHtml = `<!--
================================================================================
    DO NOT EDIT THIS FILE DIRECTLY!

    This file is auto-generated by: website/build-legal.js
    Source markdown: website/${mdFile}

    To make changes, edit the source .md file and run:
        node website/build-legal.js
================================================================================
-->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="kjekit - ${title}">
    <title>${title} - kjekit</title>
    <link rel="icon" type="image/svg+xml" href="checklist-icon.svg" data-brand="logo">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${styles}
    </style>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16 items-center">
                <div class="flex items-center">
                    <a href="index.html" class="flex items-center">
                        <img src="kjekit-path.svg" alt="kjekit" class="h-10" data-brand="logo">
                    </a>
                </div>
                <div class="flex items-center space-x-8">
                    ${navLinks}
                    <a href="https://app.kjekit.com" class="text-white px-4 py-2 rounded-lg text-sm font-medium transition" style="background-color: #3D9E9E;">Try Free</a>
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
    <footer class="bg-gray-900 text-gray-400 py-6 mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <p class="text-lg">&copy; 2025 <a href="http://rkroll.com" class="text-gray-400 hover:text-white">rkroll.com</a></p>
                    ${footerLinks}
                </div>
                <a href="https://app.kjekit.com" class="text-white px-4 py-2 rounded-lg text-sm font-medium transition" style="background-color: #3D9E9E;">Try Free</a>
            </div>
        </div>
    </footer>
    ${brandScript}
</body>
</html>
`;

  const htmlPath = join(__dirname, htmlFile);
  writeFileSync(htmlPath, fullHtml);

  // Also write to public/ for the app
  const publicPath = join(__dirname, '..', 'public', htmlFile);
  writeFileSync(publicPath, fullHtml);

  console.log(`Generated ${htmlFile} from ${mdFile}`);
}

// Generate all pages
generatePage('privacy.md', 'privacy.html', 'Privacy Policy');
generatePage('terms.md', 'terms.html', 'Terms of Service');
generatePage('about.md', 'about.html', 'About');

console.log('All pages generated successfully');
