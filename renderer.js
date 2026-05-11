// ==================== 全局变量 ====================
let video = null;
let container = null;
let isPlaying = false;
let currentScale = 1;
let isAlwaysOnTop = false;
let isMouseTransparent = false;
let currentVideoPath = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  video = document.getElementById('video');
  container = document.getElementById('container');

  setupVideoEvents();
  setupContextMenu();
  setupDragWindow();
  
  // 初始状态
  isAlwaysOnTop = await window.api.isAlwaysOnTop();
  isMouseTransparent = await window.api.isMouseTransparent();

  // 监听转换进度
  window.api.onConversionProgress((progress) => {
    console.log(`转换进度: ${progress}%`);
    showConversionProgress(progress);
  });

  // 自动打开文件选择器（第一次启动）
  const filePath = await window.api.openFile();
  if (filePath) {
    loadVideo(filePath);
  }
});

// ==================== 视频事件 ====================
function setupVideoEvents() {
  video.addEventListener('play', () => {
    isPlaying = true;
  });

  video.addEventListener('pause', () => {
    isPlaying = false;
  });

  video.addEventListener('ended', () => {
    isPlaying = false;
  });

  // 右键菜单的交互（通过事件委托）
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    if (isMouseTransparent) {
      // 如果启用了鼠标穿透，直接显示菜单
      showContextMenu(e.clientX, e.clientY);
    } else {
      // 正常显示
      showContextMenu(e.clientX, e.clientY);
    }
  });

  // 空格播放/暂停
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    }
  });

  // 视频适配
  video.addEventListener('loadedmetadata', () => {
    fitVideoToWindow();
  });
}

// ==================== 加载视频 ====================
async function loadVideo(filePath) {
  currentVideoPath = filePath;

  try {
    // 检查是否需要转换（MOV -> WebM）
    if (filePath.toLowerCase().endsWith('.mov') && process.platform === 'win32') {
      showConversionProgress(0);
      console.log('开始转换 MOV 到 WebM...');
    }

    video.src = `file:///${filePath.replace(/\\/g, '/')}`;
    
    // 重新计算窗口大小以适配新视频
    video.addEventListener('loadedmetadata', () => {
      fitVideoToWindow();
    }, { once: true });

  } catch (error) {
    console.error('加载视频失败:', error);
  }
}

// ==================== 适配视频到窗口 ====================
function fitVideoToWindow() {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  if (videoWidth && videoHeight) {
    const aspectRatio = videoWidth / videoHeight;
    
    // 基础宽度
    const baseWidth = 600;
    const calculatedHeight = Math.round(baseWidth / aspectRatio);

    // 更新容器大小
    container.style.width = `${baseWidth}px`;
    container.style.height = `${calculatedHeight}px`;

    // 更新视频元素大小
    video.style.width = '100%';
    video.style.height = '100%';
  }
}

// ==================== 播放/暂停 ====================
function togglePlayPause() {
  if (!currentVideoPath) {
    return;
  }

  if (isPlaying) {
    video.pause();
  } else {
    video.play();
  }
}

// ==================== 缩放处理 ====================
async function handleZoom(scale) {
  currentScale = scale;
  await window.api.setZoom(scale);
}

// ==================== 置顶处理 ====================
async function handleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  await window.api.setAlwaysOnTop(isAlwaysOnTop);
  console.log(`置顶: ${isAlwaysOnTop ? '开启' : '关闭'}`);
}

// ==================== 鼠标穿透处理 ====================
async function handleMouseTransparent() {
  isMouseTransparent = !isMouseTransparent;
  await window.api.setMouseTransparent(isMouseTransparent);
  
  // 更新 UI 视觉反馈
  if (isMouseTransparent) {
    container.style.opacity = '0.8';
  } else {
    container.style.opacity = '1';
  }

  console.log(`鼠标穿透: ${isMouseTransparent ? '开启' : '关闭'}`);
}

// ==================== 右键菜单 ====================
function showContextMenu(x, y) {
  const menu = document.getElementById('contextMenu');
  
  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // 菜单项事件
  const menuItems = menu.querySelectorAll('.menu-item');
  
  menuItems.forEach(item => {
    item.onclick = async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      
      switch(action) {
        case 'zoom-0.8':
          await handleZoom(0.8);
          break;
        case 'zoom-1':
          await handleZoom(1);
          break;
        case 'zoom-1.2':
          await handleZoom(1.2);
          break;
        case 'zoom-1.5':
          await handleZoom(1.5);
          break;
        case 'toggle-top':
          await handleAlwaysOnTop();
          updateMenuItemText(item, isAlwaysOnTop);
          break;
        case 'toggle-transparent':
          await handleMouseTransparent();
          updateMenuItemText(item, isMouseTransparent);
          break;
        case 'open-video':
          const filePath = await window.api.openFile();
          if (filePath) {
            loadVideo(filePath);
          }
          break;
        case 'exit':
          window.close();
          break;
      }
      
      menu.style.display = 'none';
    };
  });

  // 点击外部关闭菜单
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
  }, 0);
}

function closeContextMenu() {
  const menu = document.getElementById('contextMenu');
  menu.style.display = 'none';
}

function updateMenuItemText(item, isActive) {
  const action = item.dataset.action;
  
  if (action === 'toggle-top') {
    item.textContent = isActive ? '✓ 置顶' : '置顶';
  } else if (action === 'toggle-transparent') {
    item.textContent = isActive ? '✓ 鼠标穿透' : '鼠标穿透';
  }
}

// ==================== 窗口拖拽 ====================
function setupDragWindow() {
  let isMoving = false;
  let startX, startY;

  container.addEventListener('mousedown', (e) => {
    // 只在按住视频时不在播放时允许拖拽
    if (!isMouseTransparent) {
      isMoving = true;
      startX = e.clientX;
      startY = e.clientY;
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isMoving && !isMouseTransparent) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const currentPosition = window.getComputedStyle(container).transform;
      // 这里实际上应该通过 Electron 的窗口 API 来移动
      // 但我们暂时通过 CSS transform 实现视觉效果
    }
  });

  document.addEventListener('mouseup', () => {
    isMoving = false;
  });
}

// ==================== 转换进度显示 ====================
function showConversionProgress(progress) {
  let progressBar = document.getElementById('conversionProgress');
  
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.id = 'conversionProgress';
    progressBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #ff6b9d 0%, #c06c84 100%);
      z-index: 10000;
      transition: width 0.3s ease;
    `;
    document.body.appendChild(progressBar);
  }

  progressBar.style.width = `${progress}%`;

  if (progress >= 100) {
    setTimeout(() => {
      progressBar.remove();
    }, 500);
  }
}
