/**
 * The 404 page, kept as a module rather than an asset.
 *
 * The assets binding rewrites `.html` requests to their clean URL, so fetching
 * `/404.html` from the Worker comes back as a redirect instead of the file.
 * Importing the markup removes that round trip entirely.
 */
export const notFoundHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 — LUT ARCHIVE</title>
<style>
html,body{margin:0;height:100%;background:#0a0a0b;color:#f2f1ec;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",system-ui,sans-serif;display:grid;place-items:center}
main{max-width:520px;padding:40px 24px;text-align:center}
.code{font-family:ui-monospace,Menlo,monospace;font-size:64px;letter-spacing:.1em;color:#d9c7a3;margin:0 0 16px}
h1{font-weight:300;font-size:22px;margin:0 0 12px}
p{color:rgba(242,241,236,.6);font-size:14px;line-height:1.7;margin:0 0 24px}
a{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;background:#d9c7a3;color:#141414;padding:10px 16px;text-decoration:none;margin:0 6px 8px}
</style>
</head>
<body>
<main>
  <p class="code">404</p>
  <h1>这一格没有照片 / Nothing here</h1>
  <p>地址可能改了。从编辑器、指南或 LUT 目录重新开始。<br>The URL may have changed. Start from the editor, the guides or the look catalogue.</p>
  <a href="/">打开编辑器</a>
  <a href="/guides/">指南</a>
  <a href="/looks">64 款 LUT</a>
</main>
</body>
</html>
`;
