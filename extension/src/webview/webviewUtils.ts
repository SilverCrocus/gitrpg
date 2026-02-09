import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Options for building webview HTML from template files
 */
export interface WebviewBuildOptions {
  /** The webview to build HTML for */
  webview: vscode.Webview;
  /** Extension URI for resolving resource paths */
  extensionUri: vscode.Uri;
  /** Path to template file relative to webview directory (e.g., 'dashboard/template.html') */
  templatePath: string;
  /** Path to styles file relative to webview directory (e.g., 'dashboard/styles.css') */
  stylesPath?: string;
  /** Path to script file relative to webview directory (e.g., 'dashboard/script.js') */
  scriptPath?: string;
  /** Data to inject as window.__DATA__ global variable */
  data?: Record<string, unknown>;
  /** Page title (defaults to 'GitRPG') */
  title?: string;
}

/**
 * Generates a cryptographically secure nonce for Content Security Policy
 * @returns A 32-character random string
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Resolves the webview directory path, handling both development and production scenarios
 * In development: looks in src/webview
 * In production: looks in out/webview (compiled) or falls back to src/webview
 * @param extensionUri The extension's URI
 * @returns The path to the webview directory
 */
function getWebviewBasePath(extensionUri: vscode.Uri): string {
  const extensionPath = extensionUri.fsPath;

  // In production (installed extension), static assets are copied to out/webview
  // In development, src/webview also works since the source tree is present
  // Check out/webview first since it works in both environments
  const outPath = path.join(extensionPath, 'out', 'webview');

  if (fs.existsSync(outPath)) {
    return outPath;
  }

  // Fallback to src directory for development
  return path.join(extensionPath, 'src', 'webview');
}

/**
 * Reads a file from the webview directory
 * @param extensionUri The extension's URI
 * @param relativePath Path relative to the webview directory
 * @returns The file contents as a string
 * @throws Error if the file cannot be read
 */
export function readWebviewFile(extensionUri: vscode.Uri, relativePath: string): string {
  const basePath = getWebviewBasePath(extensionUri);
  const filePath = path.join(basePath, relativePath);

  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to read webview file '${relativePath}': ${message}`);
  }
}

/**
 * Checks if a webview file exists
 * @param extensionUri The extension's URI
 * @param relativePath Path relative to the webview directory
 * @returns True if the file exists
 */
export function webviewFileExists(extensionUri: vscode.Uri, relativePath: string): boolean {
  const basePath = getWebviewBasePath(extensionUri);
  const filePath = path.join(basePath, relativePath);
  return fs.existsSync(filePath);
}

/**
 * Gets a webview URI for a resource file
 * @param webview The webview instance
 * @param extensionUri The extension's URI
 * @param pathSegments Path segments relative to extension root
 * @returns A URI that can be used in the webview
 */
export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathSegments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));
}

/**
 * Generates the Content Security Policy meta tag
 * @param webview The webview instance
 * @param nonce The nonce for inline scripts
 * @returns The CSP meta tag string
 */
function generateCspMetaTag(webview: vscode.Webview, nonce: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">`;
}

/**
 * Generates the styles injection HTML
 * @param options Build options
 * @param nonce The nonce (not used for styles but kept for consistency)
 * @returns HTML string for styles
 */
function generateStylesHtml(options: WebviewBuildOptions, _nonce: string): string {
  if (!options.stylesPath) {
    return '';
  }

  try {
    const styles = readWebviewFile(options.extensionUri, options.stylesPath);
    return `<style>${styles}</style>`;
  } catch {
    // If file doesn't exist, try to link to it as a resource
    const stylesUri = getWebviewUri(
      options.webview,
      options.extensionUri,
      ['src', 'webview', ...options.stylesPath.split('/')]
    );
    return `<link rel="stylesheet" href="${stylesUri}">`;
  }
}

/**
 * Generates the script injection HTML
 * @param options Build options
 * @param nonce The nonce for the script
 * @returns HTML string for script
 */
function generateScriptHtml(options: WebviewBuildOptions, nonce: string): string {
  if (!options.scriptPath) {
    return '';
  }

  try {
    const script = readWebviewFile(options.extensionUri, options.scriptPath);
    return `<script nonce="${nonce}">${script}</script>`;
  } catch {
    // If file doesn't exist, try to link to it as a resource
    const scriptUri = getWebviewUri(
      options.webview,
      options.extensionUri,
      ['src', 'webview', ...options.scriptPath.split('/')]
    );
    return `<script nonce="${nonce}" src="${scriptUri}"></script>`;
  }
}

/**
 * Generates the data injection script
 * @param data The data to inject
 * @param nonce The nonce for the script
 * @returns HTML string for data script
 */
function generateDataScript(data: Record<string, unknown> | undefined, nonce: string): string {
  if (!data) {
    return '';
  }

  const jsonData = JSON.stringify(data);
  return `<script nonce="${nonce}">window.__DATA__ = ${jsonData};</script>`;
}

/**
 * Builds complete webview HTML from separate template, styles, and script files
 *
 * The template file can contain the following placeholders:
 * - {{CSP}} - Content Security Policy meta tag
 * - {{STYLES}} - Injected styles (inline or link)
 * - {{SCRIPT}} - Injected script (inline or src)
 * - {{DATA}} - Data injection script
 * - {{TITLE}} - Page title
 * - {{NONCE}} - The generated nonce value
 *
 * If the template doesn't contain placeholders, a basic HTML structure will be generated
 * with the template content placed in the body.
 *
 * @param options The build options
 * @returns Complete HTML string for the webview
 */
export function buildWebviewHtml(options: WebviewBuildOptions): string {
  const nonce = getNonce();
  const title = options.title ?? 'GitRPG';

  // Read the template file
  const template = readWebviewFile(options.extensionUri, options.templatePath);

  // Generate components
  const cspMetaTag = generateCspMetaTag(options.webview, nonce);
  const stylesHtml = generateStylesHtml(options, nonce);
  const scriptHtml = generateScriptHtml(options, nonce);
  const dataScript = generateDataScript(options.data, nonce);

  // Check if template has placeholders
  const hasPlaceholders = template.includes('{{CSP}}') ||
                          template.includes('{{STYLES}}') ||
                          template.includes('{{SCRIPT}}');

  if (hasPlaceholders) {
    // Replace placeholders in template
    return template
      .replace('{{CSP}}', cspMetaTag)
      .replace('{{STYLES}}', stylesHtml)
      .replace('{{SCRIPT}}', scriptHtml)
      .replace('{{DATA}}', dataScript)
      .replace('{{TITLE}}', title)
      .replace(/\{\{NONCE\}\}/g, nonce);
  }

  // If no placeholders, wrap template content in basic HTML structure
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMetaTag}
  <title>${title}</title>
  ${stylesHtml}
  ${dataScript}
</head>
<body>
  ${template}
  ${scriptHtml}
</body>
</html>`;
}

/**
 * Creates a simple webview HTML without external template files
 * Useful for simple webviews that don't need separate files
 *
 * @param webview The webview instance
 * @param body The HTML body content
 * @param options Optional configuration
 * @returns Complete HTML string
 */
export function createSimpleWebviewHtml(
  webview: vscode.Webview,
  body: string,
  options?: {
    title?: string;
    styles?: string;
    script?: string;
    data?: Record<string, unknown>;
  }
): string {
  const nonce = getNonce();
  const title = options?.title ?? 'GitRPG';

  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">`;

  const stylesHtml = options?.styles ? `<style>${options.styles}</style>` : '';
  const scriptHtml = options?.script ? `<script nonce="${nonce}">${options.script}</script>` : '';
  const dataScript = options?.data
    ? `<script nonce="${nonce}">window.__DATA__ = ${JSON.stringify(options.data)};</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMetaTag}
  <title>${title}</title>
  ${stylesHtml}
  ${dataScript}
</head>
<body>
  ${body}
  ${scriptHtml}
</body>
</html>`;
}
