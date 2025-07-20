import React, { useState, useEffect } from 'react';
import { UpdateInfo, DownloadProgress } from '../types';

const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [showNotification, setShowNotification] = useState(true);

  useEffect(() => {
    if (!window.electronAPI?.updater) return;

    // Listen for update events
    const unsubscribeAvailable = window.electronAPI.updater.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setShowNotification(true);
    });

    const unsubscribeProgress = window.electronAPI.updater.onDownloadProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setDownloading(true);
    });

    const unsubscribeDownloaded = window.electronAPI.updater.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdateReady(true);
      setDownloading(false);
      setShowNotification(true);
    });

    // Check for updates on component mount
    window.electronAPI.updater.checkForUpdates();

    return () => {
      unsubscribeAvailable();
      unsubscribeProgress();
      unsubscribeDownloaded();
    };
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    await window.electronAPI.updater.downloadUpdate();
  };

  const handleInstall = async () => {
    await window.electronAPI.updater.installUpdate();
  };

  if (!showNotification || (!updateAvailable && !updateReady)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-gray-medium border border-white/10 rounded-lg shadow-2xl p-4 z-1000">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">
          {updateReady ? 'Update Ready!' : 'Update Available'}
        </h3>
        <button
          onClick={() => setShowNotification(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {updateInfo && (
        <p className="text-xs text-gray-400 mb-3">
          Version {updateInfo.version} is available
          {updateInfo.releaseName && ` - ${updateInfo.releaseName}`}
        </p>
      )}

      {downloading && downloadProgress && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Downloading...</span>
            <span>{Math.round(downloadProgress.percent)}%</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1.5">
            <div 
              className="bg-purple-gradient-start h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress.percent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {(downloadProgress.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {updateReady ? (
          <>
            <button
              onClick={handleInstall}
              className="flex-1 px-3 py-1.5 bg-purple-gradient-start text-white text-xs font-medium rounded hover:bg-purple-gradient-start/80 transition-colors"
            >
              Restart & Install
            </button>
            <button
              onClick={() => setShowNotification(false)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs rounded hover:bg-gray-600 transition-colors"
            >
              Later
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 px-3 py-1.5 bg-purple-gradient-start text-white text-xs font-medium rounded hover:bg-purple-gradient-start/80 transition-colors disabled:opacity-50"
            >
              {downloading ? 'Downloading...' : 'Download Update'}
            </button>
            <button
              onClick={() => setShowNotification(false)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs rounded hover:bg-gray-600 transition-colors"
            >
              Skip
            </button>
          </>
        )}
      </div>

      {updateInfo?.releaseNotes && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">Release Notes</summary>
          <p className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
        </details>
      )}
    </div>
  );
};

export default UpdateNotification;