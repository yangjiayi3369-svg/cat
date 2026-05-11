const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 文件操作
  openFile: () => ipcRenderer.invoke('file:open'),
  
  // 窗口控制
  setZoom: (scale) => ipcRenderer.invoke('window:setZoom', scale),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke('window:setAlwaysOnTop', alwaysOnTop),
  setMouseTransparent: (transparent) => ipcRenderer.invoke('window:setMouseTransparent', transparent),
  
  // 状态查询
  isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
  isMouseTransparent: () => ipcRenderer.invoke('window:isMouseTransparent'),
  
  // 进度监听
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion:progress', (event, progress) => {
      callback(progress);
    });
  }
});
