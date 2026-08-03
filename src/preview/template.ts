import { serializePreviewUtils, escapeHtmlAttr } from './preview-utils.js';

export function renderPreviewPage(markdown: string, watchDirs: string[] = []): string {
  const previewUtilsScript = serializePreviewUtils();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wenyan Preview</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }

.header {
  display: flex; align-items: center; gap: 12px;
  height: 48px; padding: 0 16px;
  background: #fff; border-bottom: 1px solid #ddd;
  position: sticky; top: 0; z-index: 10;
}
.header h1 { font-size: 15px; font-weight: 600; margin-right: auto; white-space: nowrap; }
.header select {
  padding: 4px 8px; font-size: 13px;
  border: 1px solid #ccc; border-radius: 4px;
  background: #fff;
}
.header button {
  padding: 4px 16px; font-size: 13px;
  border: 1px solid #07c; border-radius: 4px;
  background: #07c; color: #fff; cursor: pointer;
  transition: opacity .15s;
}
.header button:hover { background: #069; }
.header button:disabled { opacity: .5; cursor: not-allowed; }

.split {
  display: flex; height: calc(100vh - 48px);
}

.EasyMDE, .EasyMDEContainer {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid #ddd;
}
.EasyMDE .CodeMirror, .EasyMDEContainer .CodeMirror {
  flex: 1;
  min-height: 0;
}
.EasyMDE .editor-statusbar, .EasyMDEContainer .editor-statusbar { flex-shrink: 0; }

.split iframe {
  flex: 1 1 0;
  min-width: 0;
  border: none; background: #fff;
  border-left: 1px solid #ddd;
  transition: opacity .2s;
}

.file-sidebar {
  width: 0; overflow: hidden;
  background: #fafafa;
  border-right: 1px solid #ddd;
  display: flex; flex-direction: column;
  transition: width .2s ease;
  flex-shrink: 0;
}
.file-sidebar.expanded { width: 260px; }

.sidebar-header {
  display: flex; align-items: center;
  height: 40px; padding: 0 12px;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
}
.sidebar-title { font-size: 13px; font-weight: 600; margin-right: auto; }
.sidebar-toggle, .sidebar-show-btn {
  background: none; border: none; cursor: pointer;
  padding: 4px 6px; font-size: 14px; color: #666;
  border-radius: 3px; line-height: 1;
}
.sidebar-toggle:hover, .sidebar-show-btn:hover { background: #e8e8e8; }
.sidebar-show-btn { margin-right: 4px; }

.file-tree {
  flex: 1; overflow-y: auto;
  padding: 4px 0; font-size: 13px;
}
.file-tree-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; color: #888; font-size: 13px;
}

.file-tree-item {
  display: block; cursor: pointer;
  white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; user-select: none;
}
.file-tree-content {
  display: flex; align-items: center; gap: 4px;
  height: 36px; padding: 0 12px;
}
.file-tree-content:hover { background: #f0f0f0; }
.file-tree-item.active .file-tree-content { background: #e3f2fd; }
.file-tree-icon { width: 1em; text-align: center; flex-shrink: 0; }
.file-tree-icon .fa-folder { color: #f5a623; }
.file-tree-item .fa-file-text-o { color: #888; }

/* 层级引导线 */
.file-tree > ul { margin: 0; }
.file-tree ul ul {
  margin-left: 4px;
  border-left: 1px dashed #d0d0d0;
}

/* 基于深度的缩进 */
.file-tree-item[data-depth="0"] .file-tree-content { padding-left: 12px; }
.file-tree-item[data-depth="1"] .file-tree-content { padding-left: 1em; }
.file-tree-item[data-depth="2"] .file-tree-content { padding-left: 52px; }
.file-tree-item[data-depth="3"] .file-tree-content { padding-left: 72px; }

.file-tree-section-header {
  padding: 8px 12px 4px; font-size: 11px; font-weight: 600;
  color: #999; text-transform: uppercase; letter-spacing: .5px;
}

.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid #ccc;
  border-top-color: #07c;
  border-radius: 50%;
  animation: spin .6s linear infinite;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

.file-tree-section + .file-tree-section { border-top: 1px solid #eee; }

@media (max-width: 768px) {
  .split { flex-direction: column; }
  .file-sidebar { display: none; }
  .file-sidebar.expanded { width: 100%; max-height: 200px; display: flex; }
  .EasyMDE, .EasyMDEContainer { height: 40vh; border-right: none; border-bottom: 1px solid #ddd; }
}
</style>
</head>
<body>

<div class="header">
  <button id="sidebarShowBtn" class="sidebar-show-btn" title="展开文件浏览器">
    <i class="fa fa-bars"></i>
  </button>
  <h1>Wenyan Preview</h1>
  <select id="themeSelect"></select>
  <select id="hlThemeSelect"></select>
  <button id="renderBtn" onclick="render()">Render</button>
  <span id="statusIndicator"></span>
</div>

<div class="split">
  <script id="watchDirsData" type="application/json">${JSON.stringify(watchDirs)}</script>
  <aside class="file-sidebar expanded" id="fileSidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">文件</span>
      <button id="sidebarToggle" class="sidebar-toggle" title="收起侧栏">
        <i class="fa fa-chevron-left"></i>
      </button>
    </div>
    <div class="file-tree" id="fileTree">
      <div class="file-tree-loading">
        <span class="spinner"></span>
        <span>加载中...</span>
      </div>
    </div>
  </aside>
  <textarea id="editor" spellcheck="false">${escapeHtml(markdown)}</textarea>
  <iframe id="preview" srcdoc=""></iframe>
</div>

<script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
<script>
// #69: 从 preview-utils.ts 注入的纯函数（isRemoteUrl/toProxyUrl/resolveToProxy/escapeHtmlAttr）
${previewUtilsScript}
const textarea = document.getElementById('editor');
const preview = document.getElementById('preview');
const themeSelect = document.getElementById('themeSelect');
const renderBtn = document.getElementById('renderBtn');
const statusIndicator = document.getElementById('statusIndicator');

var editor = new EasyMDE({
  element: textarea,
  autoDownloadFontAwesome: false,
  spellChecker: false,
  status: false,
  toolbar: ['bold', 'italic', 'heading', '|', 'code', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'guide'],
});

let lastHtml = '';
let renderTimeout;
let currentFileDir = '';

editor.codemirror.on('changes', () => {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(render, 500);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    clearTimeout(renderTimeout);
    render();
  }
});

var allThemes = [];

fetch('/themes')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    allThemes = data.builtin.concat(data.custom);
    themeSelect.innerHTML = '';
    allThemes.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      themeSelect.appendChild(opt);
    });
    render();
  })
  .catch(function() {
    themeSelect.innerHTML = '<option value="default">Default</option>';
    render();
  });

var hlThemeSelect = document.getElementById('hlThemeSelect');
fetch('/hl-themes')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    hlThemeSelect.innerHTML = '';
    data.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      hlThemeSelect.appendChild(opt);
    });
  })
  .catch(function() {
    hlThemeSelect.innerHTML = '';
  });

function setLoading(on) {
  if (on) {
    statusIndicator.innerHTML = '<span class="spinner"></span>';
    renderBtn.disabled = true;
    preview.style.opacity = '.5';
  } else {
    statusIndicator.innerHTML = '';
    renderBtn.disabled = false;
    preview.style.opacity = '1';
  }
}

async function render() {
  setLoading(true);
  try {
    const res = await fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: editor.value(),
        theme: themeSelect.value,
        hlTheme: document.getElementById('hlThemeSelect').value,
      }),
    });
    if (!res.ok) {
      var err = await res.text();
      setLoading(false);
      if (lastHtml) preview.srcdoc = lastHtml;
      return;
    }
    var data = await res.json();
    var html = data.content || '';

    // #69: currentFileDir 为空时（未通过侧栏点选文件），不静默替换。
    // 直接渲染会让 iframe srcdoc 以父文档 base 解析相对路径 → 404。
    // 状态区显示 warn，提示用户点选侧栏文件。
    var hasImgInHtml = /<img\b[^>]*src=/i.test(html);
    if (hasImgInHtml && !currentFileDir) {
      statusIndicator.innerHTML = '<span style="color:#c30;font-size:12px">未选择文件 — 图片无法预览，请从左侧侧栏点选 md 文件</span>';
    }

    // Convert <img src> relative paths in rendered HTML
    if (currentFileDir) {
      html = html.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, function(match, src) {
        if (isRemoteUrl(src) || src.startsWith('/image-proxy') || src.startsWith('data:')) return match;
        return match.replace('src="' + src + '"', 'src="' + resolveToProxy(currentFileDir, src) + '"');
      });
    }

    // Convert frontmatter cover / images paths
    var coverUrl = data.cover || '';
    if (coverUrl && !isRemoteUrl(coverUrl) && currentFileDir) {
      coverUrl = resolveToProxy(currentFileDir, coverUrl);
    }
    var imageUrls = (data.images || []).map(function(url) {
      if (isRemoteUrl(url)) return url;
      if (!currentFileDir) return url;
      return resolveToProxy(currentFileDir, url);
    });

    // Build preview HTML based on type
    var previewHtml = html;
    if (data.type === 'newspic' && imageUrls.length > 0) {
      previewHtml = buildNewsPicPreview(imageUrls, html);
    } else if (data.type === 'article' && coverUrl) {
      previewHtml = buildArticlePreview(coverUrl, html);
    }
    lastHtml = previewHtml;
    preview.srcdoc = previewHtml;
    setLoading(false);
  } catch (e) {
    setLoading(false);
    if (lastHtml) preview.srcdoc = lastHtml;
  }
}

function buildNewsPicPreview(images, contentHtml) {
  // #69: 对 url 加 HTML 属性转义，避免特殊字符断裂 srcdoc HTML
  var slides = images.map(function(url) {
    return '<div class="swiper-slide"><img src="' + escapeHtmlAttr(url) + '" alt=""></div>';
  }).join('');
  var bodyContent = '<div class="preview-swiper swiper mySwiper"><div class="swiper-wrapper">' + slides + '</div><div class="swiper-pagination"></div></div><div class="wenyan-content">' + contentHtml + '</div>';
  return '<!DOCTYPE html><html lang="zh-CN"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">' +
    '<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"><\\/script>' +
    '<style>.preview-swiper{width:100%}.preview-swiper .swiper-slide{text-align:center;background:#fafafa}.preview-swiper .swiper-slide img{max-width:100%;max-height:360px;width:auto;height:auto;display:inline-block;object-fit:contain}.preview-swiper .swiper-pagination-bullet-active{background:#07c}.wenyan-content{padding:16px}<\/style>' +
    '</head><body>' + bodyContent +
    '<script>new Swiper(".mySwiper",{pagination:{el:".swiper-pagination",clickable:true},loop:false,autoHeight:true})<\\/script>' +
    '</body></html>';
}

function buildArticlePreview(coverUrl, contentHtml) {
  // #69: 对 coverUrl 加 HTML 属性转义
  return '<div class="preview-cover"><img src="' + escapeHtmlAttr(coverUrl) + '" alt="cover"></div><div class="wenyan-content">' + contentHtml + '</div>';
}

var sidebar = document.getElementById('fileSidebar');
var fileTree = document.getElementById('fileTree');

document.getElementById('sidebarToggle').onclick = function() {
  sidebar.classList.toggle('expanded');
  var icon = this.querySelector('i');
  icon.className = sidebar.classList.contains('expanded') ? 'fa fa-chevron-left' : 'fa fa-chevron-right';
  localStorage.setItem('sidebarExpanded', sidebar.classList.contains('expanded'));
};

document.getElementById('sidebarShowBtn').onclick = function() {
  sidebar.classList.add('expanded');
  document.getElementById('sidebarToggle').querySelector('i').className = 'fa fa-chevron-left';
  localStorage.setItem('sidebarExpanded', 'true');
};

var savedSidebar = localStorage.getItem('sidebarExpanded');
if (savedSidebar === 'false') {
  sidebar.classList.remove('expanded');
}

var watchDirs = [];
try {
  var script = document.getElementById('watchDirsData');
  if (script) watchDirs = JSON.parse(script.textContent || '[]');
} catch(e) { console.warn('解析 watch-dirs 失败:', e); }
if (watchDirs.length > 0) {
  loadFileTree();
}

async function loadFileTree() {
  fileTree.innerHTML = '<div class="file-tree-loading"><span class="spinner"></span><span>加载中...</span></div>';
  var allItems = [];
  for (var i = 0; i < watchDirs.length; i++) {
    try {
      var dir = watchDirs[i];
      var res = await fetch('/files?dir=' + encodeURIComponent(dir));
      if (!res.ok) continue;
      var nodes = await res.json();
      if (watchDirs.length > 1) {
        allItems.push({ section: dir, nodes: nodes });
      } else {
        allItems = nodes;
      }
    } catch(e) { console.warn('加载目录树失败:', e); }
  }
  fileTree.innerHTML = '';
  if (allItems.length === 0) {
    fileTree.innerHTML = '<div class="file-tree-loading">此目录下无 Markdown 文件</div>';
    return;
  }
  if (watchDirs.length > 1) {
    for (var i = 0; i < allItems.length; i++) {
      var section = document.createElement('div');
      section.className = 'file-tree-section';
      var header = document.createElement('div');
      header.className = 'file-tree-section-header';
      header.textContent = allItems[i].section;
      section.appendChild(header);
      section.appendChild(renderTree(allItems[i].nodes, 0));
      fileTree.appendChild(section);
    }
  } else {
    fileTree.appendChild(renderTree(allItems, 0));
  }
  autoSelectFirstFile();
}

function renderTree(nodes, depth) {
  var ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var li = document.createElement('li');
    li.className = 'file-tree-item';
    li.setAttribute('data-depth', String(depth));
    var content = document.createElement('div');
    content.className = 'file-tree-content';
    if (node.type === 'dir') {
      var icon = document.createElement('span');
      icon.className = 'file-tree-icon';
      icon.innerHTML = '<i class="fa fa-caret-right"></i>';
      var folderIcon = document.createElement('span');
      folderIcon.className = 'file-tree-icon';
      folderIcon.innerHTML = '<i class="fa fa-folder"></i>';
      var name = document.createElement('span');
      name.textContent = node.name;
      content.appendChild(icon);
      content.appendChild(folderIcon);
      content.appendChild(name);
      li.appendChild(content);
      if (node.children && node.children.length > 0) {
        var childUl = renderTree(node.children, depth + 1);
        childUl.style.display = 'none';
        li.appendChild(childUl);
      }
      content.onclick = (function(li, content, node) {
        return function(e) {
          e.stopPropagation();
          var childContainer = li.querySelector(':scope > ul');
          var caret = content.querySelector('.fa-caret-right, .fa-caret-down');
          if (childContainer) {
            if (childContainer.style.display === 'none') {
              childContainer.style.display = '';
              if (caret) caret.className = 'fa fa-caret-down';
            } else {
              childContainer.style.display = 'none';
              if (caret) caret.className = 'fa fa-caret-right';
            }
          } else if (node.hasMore) {
            loadMoreDir(li, content, node.path);
          }
        };
      })(li, content, node);
    } else {
      (function(li, node, content) {
        var spacer = document.createElement('span');
        spacer.className = 'file-tree-icon';
        var fileIcon = document.createElement('span');
        fileIcon.className = 'file-tree-icon';
        fileIcon.innerHTML = '<i class="fa fa-file-text-o"></i>';
        var name = document.createElement('span');
        name.textContent = node.name;
        content.appendChild(spacer);
        content.appendChild(fileIcon);
        content.appendChild(name);
        li.appendChild(content);
        content.onclick = function(e) {
          e.stopPropagation();
          loadFileContent(li, node.path);
        };
      })(li, node, content);
    }
    ul.appendChild(li);
  }
  return ul;
}

function autoSelectFirstFile() {
  var firstFile = fileTree.querySelector('.file-tree-item .fa-file-text-o');
  if (firstFile) firstFile.closest('.file-tree-item').click();
}

async function loadMoreDir(li, content, dirPath) {
  var caret = content.querySelector('.fa-caret-right, .fa-caret-down');
  if (caret) caret.className = 'fa fa-caret-down';
  try {
    var res = await fetch('/files?dir=' + encodeURIComponent(dirPath));
    if (!res.ok) { if (caret) caret.className = 'fa fa-caret-right'; return; }
    var nodes = await res.json();
    if (nodes.length === 0) { if (caret) caret.className = 'fa fa-caret-right'; return; }
    var childUl = renderTree(nodes, parseInt(li.getAttribute('data-depth')) + 1);
    li.appendChild(childUl);
    var childContainer = li.querySelector(':scope > ul');
    if (childContainer) childContainer.style.display = '';
  } catch(e) {
    if (caret) caret.className = 'fa fa-caret-right';
  }
}

async function loadFileContent(li, filePath) {
  document.querySelectorAll('.file-tree-item.active').forEach(function(el) { el.classList.remove('active'); });
  li.classList.add('active');
  var lastSlash = filePath.lastIndexOf('/');
  currentFileDir = lastSlash > -1 ? filePath.slice(0, lastSlash) : '';
  try {
    var res = await fetch('/file?path=' + encodeURIComponent(filePath));
    if (!res.ok) { alert('文件加载失败'); return; }
    var data = await res.json();
    editor.value(data.content);
    editor.codemirror.scrollTo(0, 0);
    clearTimeout(renderTimeout);
    render();
  } catch(e) { alert('文件加载失败'); }
}
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
