const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

// ==================== 全局变量 ====================
let mainWindow;
let isAlwaysOnTop = false;
let isMouseTransparent = false;
const supportedFormats = ['.mov', '.mp4', '.webm', '.avi', '.mkv'];

// ==================== 应用初始化 ====================
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ==================== 创建窗口 ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 338,
    minWidth: 300,
    minHeight: 170,
    
    // 透明窗口配置
    transparent: true,
    frame: false,
    fullscreenable: false,
    
    // 窗口样式
    show: false,
    
    // Electron 安全配置
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
    }
  });

  // 加载应用
  mainWindow.loadFile('index.html');
  
  // 显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发模式下打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== IPC 处理：文件选择 ====================
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Video Files',
        extensions: supportedFormats.map(f => f.slice(1))
      },
      {
        name: 'All Files',
        extensions: ['*']
      }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    
    // 检查是否需要转换
    if (process.platform === 'win32' && filePath.toLowerCase().endsWith('.mov')) {
      return await convertVideoToWebM(filePath);
    }

    return filePath;
  }

  return null;
});

// ==================== 视频转换函数（Windows MOV → WebM）====================
async function convertVideoToWebM(inputPath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(inputPath, path.extname(inputPath));
    const outputDir = path.join(app.getPath('userData'), 'converted-videos');
    
    // 创建输出目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${fileName}.webm`);

    // 如果已转换过，直接返回
    if (fs.existsSync(outputPath)) {
      resolve(outputPath);
      return;
    }

    // FFmpeg 参数
    const args = [
      '-i', inputPath,
      '-c:v', 'libvpx-vp9',      // VP9 编码器
      '-pix_fmt', 'yuva420p',     // 🔑 带 Alpha 的像素格式
      '-b:v', '2000k',            // 视频码率
      '-c:a', 'libopus',          // 音频编码
      '-b:a', '128k',             // 音频码率
      '-progress', 'pipe:1',      // 实时进度
      '-y',                        // 覆盖输出文件
      outputPath
    ];

    // 执行 FFmpeg
    const ffmpeg = execFile(ffmpegStatic, args, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg 转换错误:', error);
        reject(error);
        return;
      }

      console.log('转换完成:', outputPath);
      resolve(outputPath);
    });

    // 监听转换进度
    ffmpeg.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/out_time_ms=(\d+)/);
      
      if (match) {
        // 计算进度百分比（这里需要知道总时长）
        // 简化版本：根据输出行数估算
        const lines = output.split('\n').length;
        const progress = Math.min(lines * 2, 100);
        
        mainWindow.webContents.send('conversion:progress', progress);
      }
    });

    // 监听错误输出（FFmpeg 使用 stderr 输出进度）
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      
      // 从 FFmpeg stderr 提取进度信息
      const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);

      if (durationMatch && timeMatch) {
        const duration = parseInt(durationMatch[1]) * 3600 + 
                        parseInt(durationMatch[2]) * 60 + 
                        parseFloat(durationMatch[3]);
        
        const current = parseInt(timeMatch[1]) * 3600 + 
                       parseInt(timeMatch[2]) * 60 + 
                       parseFloat(timeMatch[3]);

        const progress = Math.min(Math.round((current / duration) * 100), 100);
        mainWindow.webContents.send('conversion:progress', progress);
      }
    });
  });
}

// ==================== IPC 处理：窗口缩放 ====================
ipcMain.handle('window:setZoom', (event, scale) => {
  const currentBounds = mainWindow.getBounds();
  const baseWidth = 600;
  const baseHeight = 338;

  const newWidth = Math.round(baseWidth * scale);
  const newHeight = Math.round(baseHeight * scale);

  mainWindow.setBounds({
    x: currentBounds.x,
    y: currentBounds.y,
    width: newWidth,
    height: newHeight
  });

  return true;
});

// ==================== IPC 处理：置顶 ====================
ipcMain.handle('window:setAlwaysOnTop', (event, alwaysOnTop) => {
  isAlwaysOnTop = alwaysOnTop;
  mainWindow.setAlwaysOnTop(alwaysOnTop);
  return true;
});

ipcMain.handle('window:isAlwaysOnTop', () => {
  return isAlwaysOnTop;
});

// ==================== IPC 处理：鼠标穿透 ====================
ipcMain.handle('window:setMouseTransparent', (event, transparent) => {
  isMouseTransparent = transparent;
  
  if (transparent) {
    // 启用鼠标穿透
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    // 禁用鼠标穿透
    mainWindow.setIgnoreMouseEvents(false);
  }

  return true;
});

ipcMain.handle('window:isMouseTransparent', () => {
  return isMouseTransparent;
});

// ==================== IPC 处理：应该转换 ====================
ipcMain.handle('ffmpeg:shouldConvert', (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const isWindows = process.platform === 'win32';
  
  // Windows 上的 MOV 文件需要转换
  if (isWindows && ext === '.mov') {
    return true;
  }

  return false;
});

// ==================== 错误处理 ====================
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

ipcMain.on('app:exit', () => {
  app.quit();
});
